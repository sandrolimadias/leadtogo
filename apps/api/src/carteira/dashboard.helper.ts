import { configuracaoDeTeste } from '../testes/app-teste.js'

/** A configuração dos testes do Dashboard (atrás de proxy, para o IP de cada chamada ser independente). */
export const configuracaoDaTeste = () => configuracaoDeTeste({ TRUST_PROXY: '1' })
