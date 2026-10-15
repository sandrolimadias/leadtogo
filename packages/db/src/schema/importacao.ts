import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { origens, tags, verticais } from './cadastros.js'
import { empresas } from './carteira.js'
import { membros, tenants } from './plataforma.js'
import { arquivos } from './sistema.js'
import { carimbos, chaveUuid } from './tipos.js'

// Importação de planilha (docs/modelagem_banco.md, seção 11 e escopo_mvp.md, Módulo 4).
// RLS, FORCE e GRANTs ficam na migração. `empresas.importacao_id` tem a FK só no SQL da migração
// (importar `importacoes` em `carteira.ts` faria ciclo de módulos), como `empresa_socios.contato_id`.

export const tipoImportacao = pgEnum('tipo_importacao', ['empresas', 'contatos'])
/** De onde vêm os dados da empresa: a planilha, tudo da Receita ou a planilha completada pela Receita. */
export const fonteDadosImportacao = pgEnum('fonte_dados_importacao', [
  'planilha',
  'receita',
  'completar',
])
export const situacaoImportacao = pgEnum('situacao_importacao', [
  'rascunho',
  'pronta',
  'em_andamento',
  'concluida',
  'falhou',
  'cancelada',
  'desfeita',
])
export const estabelecimentoDoPerfil = pgEnum('estabelecimento_do_perfil', [
  'ambas',
  'matriz',
  'filial',
])
/** O que fazer com quem não passa nas regras do perfil. */
export const acaoForaDoPerfil = pgEnum('acao_fora_do_perfil', ['pular', 'importar_com_tag'])
export const resultadoDaLinha = pgEnum('resultado_da_linha', [
  'pendente',
  'criada',
  'criada_fora_do_perfil',
  'fora_do_perfil',
  'pulada_sem_cnpj',
  'pulada_duplicada',
  'pulada_nao_ativa',
  'erro',
])

/** Regras de importação nomeadas por empresa (tenant): nada fixo no código. */
export const importacaoPerfis = pgTable(
  'importacao_perfis',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: text().notNull(),
    /** Só entra empresa com situação ativa na Receita */
    exigeSituacaoAtiva: boolean().notNull().default(true),
    estabelecimento: estabelecimentoDoPerfil().notNull().default('ambas'),
    excluirMei: boolean().notNull().default(false),
    /** CNAEs aceitos (7 dígitos); vazio = qualquer CNAE */
    cnaes: integer()
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    /** Aceita o CNAE da lista também entre os secundários */
    aceitarCnaeSecundario: boolean().notNull().default(false),
    acaoForaDoPerfil: acaoForaDoPerfil().notNull().default('pular'),
    ativo: boolean().notNull().default(true),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('importacao_perfis_nome_uq')
      .on(t.tenantId, sql`lower(${t.nome})`)
      .where(sql`${t.excluidoEm} IS NULL`),
  ],
)

/** Um lote: o arquivo, as escolhas feitas nos passos e o andamento. Desfazível e filtrável. */
export const importacoes = pgTable(
  'importacoes',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    tipo: tipoImportacao().notNull().default('empresas'),
    nome: text().notNull(),
    arquivoId: uuid().references(() => arquivos.id),
    nomeArquivo: text().notNull(),
    fonteDados: fonteDadosImportacao().notNull().default('planilha'),
    perfilId: uuid().references(() => importacaoPerfis.id),
    /** Cópia das regras usadas no lote (o perfil pode mudar depois); nulo = "Sem regras" */
    regras: jsonb(),
    /** Coluna da planilha → campo do sistema */
    mapeamento: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Espera entre duas consultas à Receita */
    intervaloMs: integer().notNull().default(3000),
    // Passo Carteira
    vendedorId: uuid().references(() => membros.id),
    statusTagId: uuid().references(() => tags.id),
    origemId: uuid().references(() => origens.id),
    verticalId: uuid().references(() => verticais.id),
    situacao: situacaoImportacao().notNull().default('rascunho'),
    totalLinhas: integer().notNull().default(0),
    /** Não consultar a Receita antes disso (intervalo ou espera por 429); vale entre blocos e workers */
    proximaConsultaEm: timestamp({ withTimezone: true }),
    /** Última vez que uma linha foi resolvida (a varredura usa para achar lote parado) */
    ultimoProgressoEm: timestamp({ withTimezone: true }),
    /** Contagem por resultado, para o relatório */
    totais: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    iniciadoEm: timestamp({ withTimezone: true }),
    concluidoEm: timestamp({ withTimezone: true }),
    desfeitaEm: timestamp({ withTimezone: true }),
    desfeitaPor: uuid().references((): AnyPgColumn => membros.id),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('importacoes_situacao_idx').on(t.tenantId, t.situacao),
    index('importacoes_criado_idx').on(t.tenantId, t.criadoEm),
    check('importacoes_intervalo', sql`${t.intervaloMs} BETWEEN 500 AND 60000`),
  ],
)

/** Cada linha da planilha e o que aconteceu com ela (é o que filtra o relatório e desfaz o lote). */
export const importacaoLinhas = pgTable(
  'importacao_linhas',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    importacaoId: uuid()
      .notNull()
      .references(() => importacoes.id),
    /** Posição na planilha (começa em 1, sem o cabeçalho) */
    numero: integer().notNull(),
    /** A linha como veio, por coluna da planilha */
    dados: jsonb().notNull(),
    /** CNPJ normalizado, quando a linha tem um válido */
    documento: varchar({ length: 14 }),
    resultado: resultadoDaLinha().notNull().default('pendente'),
    /** Texto do relatório (por que foi pulada, qual erro) */
    motivo: text(),
    /** Empresa criada por esta linha (ou a que já existia, nas duplicadas) */
    empresaId: uuid().references(() => empresas.id),
    processadaEm: timestamp({ withTimezone: true }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('importacao_linhas_numero_uq').on(t.importacaoId, t.numero),
    index('importacao_linhas_resultado_idx').on(t.tenantId, t.importacaoId, t.resultado),
    index('importacao_linhas_empresa_idx').on(t.tenantId, t.empresaId),
  ],
)
