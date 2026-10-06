window.LTD = (function () {
  var S = { Lead: 'teal', Prospect: 'amber', Cliente: 'green', Inativo: 'gray', Visitada: 'orange', Contactada: 'blue', Monitoramento: 'purple', Retrofit: 'pink' };
  function e(id, fantasia, razao, cnpj, cidade, bairro, status, visit, interesse, vertical, vendedor, uv, dv, uc, dc, prox, tel, wpp, ops, valor) {
    var tags = [status].concat(visit).concat(interesse);
    return { id: id, fantasia: fantasia, razao: razao, cnpj: cnpj, cidade: cidade, uf: 'ES', bairro: bairro, status: status,
      tags: tags.map(function (t) { return { label: t, color: S[t] }; }), vertical: vertical, vendedor: vendedor,
      ultimaVisita: uv, diasVisita: dv, ultimoContato: uc, diasContato: dc, proxima: prox, telefone: tel, whatsapp: wpp, opAbertas: ops, valorAberto: valor };
  }
  var empresas = [
    e('usidantec', 'Usidantec', 'Usidantec Usinagem e Mecânica Ltda', '12.424.587/0001-45', 'Serra', 'Jardim Limoeiro', 'Cliente', ['Visitada', 'Contactada'], ['Monitoramento'], 'Metalmecânica', 'Alessandro Dias', '12/09/2026', 23, '01/10/2026', 4, { type: 'visita', label: 'Amanhã, 09:00' }, '(27) 3064-3021', '(27) 99812-4410', 2, 32600),
    e('serraazul', 'Metalúrgica Serra Azul', 'Metalúrgica Serra Azul Ltda', '08.917.330/0001-02', 'Serra', 'Civit II', 'Prospect', ['Contactada'], ['Retrofit'], 'Metalmecânica', 'Carolina Surlo', '28/07/2026', 69, '22/09/2026', 13, { type: 'ligacao', label: 'Hoje, 16:30' }, '(27) 3338-7710', '(27) 99744-2019', 1, 24600),
    e('valecastelo', 'Laticínios Vale do Castelo', 'Laticínios Vale do Castelo Ltda', '21.506.884/0001-70', 'Castelo', 'Centro', 'Cliente', ['Visitada'], [], 'Alimentos', 'Alessandro Dias', '18/08/2026', 48, '18/08/2026', 48, null, '(28) 3542-1180', '(28) 99915-3302', 1, 14400),
    e('montanhas', 'Café Montanhas Capixabas', 'Montanhas Capixabas Torrefação e Comércio Ltda', '33.120.457/0001-91', 'Venda Nova do Imigrante', 'Vila da Mata', 'Lead', [], [], 'Alimentos', 'Juliana Pimentel', '—', null, '—', null, { type: 'whatsapp', label: 'Qua, 10:00' }, '(28) 3546-2207', '(28) 99883-1145', 0, 0),
    e('itaguacu', 'Granitos Itaguaçu', 'Itaguaçu Mármores e Granitos Ltda', '05.774.219/0001-36', 'Cachoeiro de Itapemirim', 'Aeroporto', 'Prospect', ['Visitada', 'Contactada'], ['Monitoramento'], 'Rochas ornamentais', 'Rafael Bertoldi', '30/09/2026', 5, '30/09/2026', 5, { type: 'reuniao', label: 'Qui, 14:00' }, '(28) 3522-6640', '(28) 99971-0832', 1, 41800),
    e('rotacapixaba', 'Transportadora Rota Capixaba', 'Rota Capixaba Transportes e Logística Ltda', '17.338.602/0001-14', 'Cariacica', 'Jardim América', 'Cliente', ['Contactada'], [], 'Logística', 'Carolina Surlo', '04/06/2026', 123, '25/07/2026', 72, null, '(27) 3286-4415', '(27) 99630-5571', 0, 0),
    e('vitoriasaude', 'Vitória Saúde Ocupacional', 'Clínica Vitória Saúde Ocupacional Ltda', '29.004.611/0001-58', 'Vitória', 'Enseada do Suá', 'Lead', ['Contactada'], [], 'Saúde', 'Juliana Pimentel', '—', null, '29/09/2026', 6, { type: 'email', label: 'Hoje, 11:00' }, '(27) 3025-9900', '(27) 99288-6014', 1, 9600),
    e('praiacanto', 'Construtora Praia do Canto', 'Construtora Praia do Canto S.A.', '02.663.948/0001-27', 'Vitória', 'Praia do Canto', 'Inativo', [], [], 'Construção civil', 'Rafael Bertoldi', '11/02/2026', 236, '03/03/2026', 216, null, '(27) 3315-0480', '', 0, 0),
    e('linhares', 'Distribuidora Linhares', 'Linhares Distribuidora de Alimentos Ltda', '14.882.075/0001-63', 'Linhares', 'Interlagos', 'Cliente', ['Visitada'], ['Retrofit'], 'Distribuição', 'Alessandro Dias', '02/07/2026', 95, '28/07/2026', 69, null, '(27) 3371-8822', '(27) 99905-7748', 1, 18000),
    e('colatina', 'Moveleira Colatina', 'Indústria Moveleira Colatina Ltda', '09.551.736/0001-80', 'Colatina', 'São Silvano', 'Prospect', ['Contactada'], [], 'Moveleiro', 'Carolina Surlo', '—', null, '14/09/2026', 21, { type: 'visita', label: 'Sex, 08:30' }, '(27) 3722-4019', '(27) 99637-1180', 1, 27500),
    e('guarapari', 'Pescados Guarapari', 'Guarapari Pescados e Frigorífico Ltda', '36.207.118/0001-05', 'Guarapari', 'Muquiçaba', 'Lead', [], [], 'Alimentos', 'Juliana Pimentel', '—', null, '—', null, null, '(27) 3361-2290', '(27) 99761-4432', 0, 0),
    e('aracruz', 'Mecânica Aracruz Industrial', 'Aracruz Mecânica Industrial Ltda', '11.493.260/0001-49', 'Aracruz', 'Coqueiral', 'Cliente', ['Visitada', 'Contactada'], ['Monitoramento'], 'Metalmecânica', 'Rafael Bertoldi', '15/09/2026', 20, '02/10/2026', 3, { type: 'ligacao', label: 'Amanhã, 15:00' }, '(27) 3256-7701', '(27) 99852-3364', 2, 52300),
    e('anchieta', 'Caldeiraria Anchieta', 'Caldeiraria e Montagens Anchieta Ltda', '24.719.903/0001-11', 'Anchieta', 'Ubu', 'Prospect', ['Visitada'], [], 'Metalmecânica', 'Alessandro Dias', '05/06/2026', 122, '06/07/2026', 91, null, '(28) 3536-1422', '(28) 99940-2266', 1, 36000),
    e('vilavelha', 'Embalagens Vila Velha', 'Vila Velha Embalagens Plásticas Ltda', '18.006.532/0001-97', 'Vila Velha', 'Glória', 'Cliente', ['Visitada', 'Contactada'], [], 'Plásticos', 'Carolina Surlo', '24/09/2026', 11, '03/10/2026', 2, { type: 'reuniao', label: 'Hoje, 14:00' }, '(27) 3229-5530', '(27) 99118-7042', 1, 19800),
    e('saomateus', 'Agroindustrial São Mateus', 'Agroindustrial São Mateus Ltda', '27.381.640/0001-22', 'São Mateus', 'Boa Vista', 'Lead', [], [], 'Agronegócio', 'Rafael Bertoldi', '—', null, '—', null, null, '(27) 3763-0915', '(27) 99706-5583', 0, 0)
  ];
  function c(id, name, papel, emps, tels, emails, ult, extra) {
    return Object.assign({ id: id, name: name, papel: papel,
      empresas: emps.map(function (x) { return { id: x[0], cargo: x[1], principal: !!x[2], ativo: x[3] !== false }; }),
      tels: tels.map(function (t) { return { n: t[0], tipo: t[1], wpp: !!t[2], principal: !!t[3] }; }),
      emails: emails.map(function (m) { return { e: m[0], tipo: m[1] || 'Trabalho' }; }),
      ultima: ult ? { type: ult[0], label: ult[1], dias: ult[2] } : null,
      aniversario: '', linkedin: '', lgpd: { base: 'Legítimo interesse', origem: 'Cadastro manual', data: '02/02/2024', optout: false } }, extra || {});
  }
  var contatos = [
    c('daniel', 'Daniel Prates', 'Decisor', [['usidantec', 'Sócio-administrador', true], ['aracruz', 'Conselheiro', false]], [['(27) 99812-4410', 'Celular', true, true], ['(27) 3064-3021', 'Fixo']], [['daniel@usidantec.com.br'], ['daniel.prates@gmail.com', 'Pessoal']], ['whatsapp', 'Hoje, 09:30', 0], { aniversario: '14/03', linkedin: 'linkedin.com/in/danielprates', lgpd: { base: 'Consentimento', origem: 'Formulário do site', data: '12/09/2026', optout: false } }),
    c('fernanda', 'Fernanda Lírio', 'Influenciador', [['usidantec', 'Compras', true]], [['(27) 99654-2281', 'Celular', true, true]], [['compras@usidantec.com.br']], ['email', '01/10', 4]),
    c('marcos', 'Marcos Tononi', 'Técnico', [['usidantec', 'Gerente de manutenção', true]], [['(27) 99723-0916', 'Celular', true, true]], [['manutencao@usidantec.com.br']], ['visita', '12/09', 23]),
    c('patricia', 'Patrícia Zanotti', 'Financeiro', [['usidantec', 'Financeiro', true]], [['(27) 3064-3025', 'Fixo', false, true]], [['financeiro@usidantec.com.br']], null),
    c('ricardo', 'Ricardo Bassini', 'Decisor', [['serraazul', 'Diretor industrial', true]], [['(27) 99744-2019', 'Celular', true, true]], [['ricardo@serraazul.ind.br']], ['ligacao', '22/09', 13]),
    c('helena', 'Helena Coutinho', 'Decisor', [['vitoriasaude', 'Diretora administrativa', true]], [['(27) 99288-6014', 'Celular', true, true]], [['helena@vitoriasaude.com.br']], ['email', '29/09', 6]),
    c('simone', 'Simone Rangel', 'Influenciador', [['vilavelha', 'Coordenadora de manutenção', true], ['linhares', 'Consultora', false, false]], [['(27) 99118-7042', 'Celular', true, true]], [['simone@vvembalagens.com.br']], ['reuniao', '03/10', 2]),
    c('vanessa', 'Vanessa Loureiro', 'Decisor', [['aracruz', 'Gerente geral', true]], [['(27) 99852-3364', 'Celular', true, true]], [['vanessa@aracruzmecanica.com.br']], ['ligacao', '02/10', 3]),
    c('jorge', 'Jorge Scaramussa', 'Técnico', [['anchieta', 'Supervisor de produção', true]], [['(28) 99940-2266', 'Celular', true, true]], [['producao@caldeirariaanchieta.com.br']], ['visita', '05/06', 122]),
    c('paulo', 'Paulo Bremenkamp', 'Decisor', [['linhares', 'Sócio', true]], [['(27) 99905-7748', 'Celular', true, true], ['(27) 3371-8822', 'Fixo']], [['paulo@distlinhares.com.br']], ['ligacao', '28/07', 69]),
    c('luciana', 'Luciana Moschen', 'Influenciador', [['itaguacu', 'Engenheira de processos', true]], [['(28) 99971-0832', 'Celular', true, true]], [['luciana@granitositaguacu.com.br']], ['visita', '30/09', 5]),
    c('otavio', 'Otávio Falqueto', 'Decisor', [['montanhas', 'Proprietário', true]], [['(28) 99883-1145', 'Celular', true, true]], [], null),
    c('helio', 'Hélio Pandolfi', 'Decisor', [['colatina', 'Diretor', true]], [['(27) 99637-1180', 'Celular', true, true]], [['helio@moveleiracolatina.com.br']], ['ligacao', '14/09', 21]),
    c('roberta', 'Roberta Calmon', 'Usuário', [['rotacapixaba', 'Analista de frota', true]], [['(27) 99630-5571', 'Celular', true, true]], [['frota@rotacapixaba.com.br']], ['whatsapp', '25/07', 72], { lgpd: { base: 'Legítimo interesse', origem: 'Importação de planilha', data: '10/01/2025', optout: true } })
  ];
  return {
    contatos: contatos,
    contato: function (id) { for (var i = 0; i < contatos.length; i++) if (contatos[i].id === id) return contatos[i]; return contatos[0]; },
    statusColor: S,
    usuario: { name: 'Alessandro Dias', role: 'Admin' },
    tenants: [
      { id: 'dias', name: 'Dias Automação Industrial', role: 'Admin', color: 'teal' },
      { id: 'surlo', name: 'Surlo Soluções Fiscais', role: 'Vendedor', color: 'indigo' },
      { id: 'norte', name: 'Norte Capixaba Equipamentos', role: 'Gestor', color: 'orange' }
    ],
    vendedores: ['Alessandro Dias', 'Carolina Surlo', 'Rafael Bertoldi', 'Juliana Pimentel'],
    cidades: ['Anchieta', 'Aracruz', 'Cachoeiro de Itapemirim', 'Cariacica', 'Castelo', 'Colatina', 'Guarapari', 'Linhares', 'São Mateus', 'Serra', 'Venda Nova do Imigrante', 'Vila Velha', 'Vitória'],
    empresas: empresas,
    empresa: function (id) { for (var i = 0; i < empresas.length; i++) if (empresas[i].id === id) return empresas[i]; return empresas[0]; },
    fases: [
      { id: 'qualificacao', title: 'Qualificação', color: 'teal', prob: 10 },
      { id: 'diagnostico', title: 'Diagnóstico', color: 'blue', prob: 25 },
      { id: 'proposta', title: 'Proposta', color: 'indigo', prob: 50 },
      { id: 'negociacao', title: 'Negociação', color: 'amber', prob: 75 }
    ],
    funis: ['Vendas novas', 'Renovação', 'Pós-venda'],
    oportunidades: [
      { id: 'o1', fase: 'qualificacao', title: 'Monitoramento de 6 tornos', company: 'Moveleira Colatina', empresaId: 'colatina', value: 27500, mrr: 1250, owner: 'Carolina Surlo', due: '28/11', next: { type: 'visita', label: 'Visita sex, 08:30' }, solucao: 'Monitoramento de máquinas', origem: 'Prospecção ativa', prob: 10 },
      { id: 'o2', fase: 'qualificacao', title: 'Diagnóstico de paradas', company: 'Vitória Saúde Ocupacional', empresaId: 'vitoriasaude', value: 9600, mrr: 800, owner: 'Juliana Pimentel', due: '15/12', next: { type: 'email', label: 'E-mail hoje, 11:00' }, solucao: 'Manutenção preditiva', origem: 'Site', prob: 10 },
      { id: 'o3', fase: 'diagnostico', title: 'Retrofit prensa hidráulica', company: 'Caldeiraria Anchieta', empresaId: 'anchieta', value: 36000, mrr: 0, owner: 'Alessandro Dias', due: '30/10', next: false, stale: 'Parada há 18 dias nesta fase', solucao: 'Retrofit de CLP', origem: 'Indicação', prob: 25 },
      { id: 'o4', fase: 'diagnostico', title: 'Sensores na linha de corte', company: 'Granitos Itaguaçu', empresaId: 'itaguacu', value: 41800, mrr: 1900, owner: 'Rafael Bertoldi', due: '20/11', next: { type: 'reuniao', label: 'Reunião qui, 14:00' }, solucao: 'Monitoramento de máquinas', origem: 'Evento', prob: 25 },
      { id: 'o5', fase: 'proposta', title: 'Licenças + implantação', company: 'Metalúrgica Serra Azul', empresaId: 'serraazul', value: 24600, mrr: 1300, owner: 'Carolina Surlo', due: '03/10', dueState: 'late', next: { type: 'ligacao', label: 'Ligação hoje, 16:30' }, stale: 'Parada há 12 dias nesta fase', solucao: 'Monitoramento de máquinas', origem: 'Prospecção ativa', prob: 50 },
      { id: 'o6', fase: 'proposta', title: 'Contrato anual 2027', company: 'Usidantec', empresaId: 'usidantec', value: 8000, mrr: 500, owner: 'Alessandro Dias', due: '30/10', next: { type: 'visita', label: 'Visita amanhã, 09:00' }, solucao: 'Monitoramento de máquinas', origem: 'Indicação', prob: 50 },
      { id: 'o7', fase: 'proposta', title: 'Preditiva em compressores', company: 'Embalagens Vila Velha', empresaId: 'vilavelha', value: 19800, mrr: 1650, owner: 'Carolina Surlo', due: '05/10', dueState: 'today', next: { type: 'reuniao', label: 'Reunião hoje, 14:00' }, solucao: 'Manutenção preditiva', origem: 'Indicação', prob: 50 },
      { id: 'o8', fase: 'negociacao', title: 'Expansão para filial Aracruz', company: 'Mecânica Aracruz Industrial', empresaId: 'aracruz', value: 38500, mrr: 2100, owner: 'Rafael Bertoldi', due: '17/10', next: { type: 'ligacao', label: 'Ligação ter, 15:00' }, solucao: 'Monitoramento de máquinas', origem: 'Indicação', prob: 75 },
      { id: 'o9', fase: 'negociacao', title: 'Retrofit câmara fria', company: 'Distribuidora Linhares', empresaId: 'linhares', value: 18000, mrr: 0, owner: 'Alessandro Dias', due: '24/10', next: false, solucao: 'Retrofit de CLP', origem: 'Site', prob: 75 },
      { id: 'o10', fase: 'negociacao', title: 'Usinagem: segundo turno', company: 'Usidantec', empresaId: 'usidantec', value: 24600, mrr: 1300, owner: 'Alessandro Dias', due: '22/10', next: { type: 'whatsapp', label: 'WhatsApp qua, 10:00' }, solucao: 'Manutenção preditiva', origem: 'Indicação', prob: 75 }
    ],
    motivos: {
      conquistado: [],
      perdido: ['Preço', 'Concorrência', 'Sem orçamento', 'Sem retorno do cliente', 'Escolheu solução interna'],
      cancelado: ['Cliente desistiu do projeto', 'Duplicada', 'Cadastro errado'],
      suspenso: ['Aguardando orçamento do cliente', 'Mudança de prioridade', 'Parada da fábrica', 'Troca de gestor']
    },
    contatosUsidantec: [
      { name: 'Daniel Prates', cargo: 'Sócio-administrador', papel: 'Decisor', tel: '(27) 99812-4410', email: 'daniel@usidantec.com.br', principal: true },
      { name: 'Fernanda Lírio', cargo: 'Compras', papel: 'Influenciador', tel: '(27) 99654-2281', email: 'compras@usidantec.com.br', principal: false },
      { name: 'Marcos Tononi', cargo: 'Gerente de manutenção', papel: 'Técnico', tel: '(27) 99723-0916', email: 'manutencao@usidantec.com.br', principal: false },
      { name: 'Patrícia Zanotti', cargo: 'Financeiro', papel: 'Financeiro', tel: '(27) 3064-3025', email: 'financeiro@usidantec.com.br', principal: false }
    ]
  };
})();
