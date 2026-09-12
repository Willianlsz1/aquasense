// Prévia isolada: nenhuma consulta, persistência ou envio ao sistema real.
const exemplos = {
  normal: { nivel:8.4, rotulo:'NORMAL', significado:'Abaixo do limite de atenção do exemplo.', titulo:'Como interpretar esta leitura', texto:'A faixa NORMAL indica apenas que o nível está abaixo do limite configurado. Ela não é uma avaliação de segurança de uma barragem.', evento:'Recepção de dados restabelecida', detalhe:'O instrumento voltou a enviar leituras no cenário ilustrado.', tipo:'COMUNICAÇÃO' },
  atencao: { nivel:13.2, rotulo:'ATENÇÃO', significado:'Entre os limites de atenção e crítico do exemplo.', titulo:'O nível cruzou o limite de atenção', texto:'Confira a evolução e a qualidade das leituras. Na bancada, aproximar o alvo demonstra esta transição; os limites de 12 e 15 m equivalentes são didáticos.', evento:'Entrada na faixa de atenção', detalhe:'O nível equivalente ultrapassou 12 m neste exemplo.', tipo:'NÍVEL' },
  critico: { nivel:16.8, rotulo:'CRÍTICO', significado:'Acima do limite crítico do exemplo.', titulo:'Prioridade de acompanhamento', texto:'O limite crítico configurado foi ultrapassado. Em uma aplicação real, a resposta depende do procedimento definido pelos responsáveis técnicos; este exemplo não determina uma ação de campo.', evento:'Entrada na faixa crítica', detalhe:'O nível equivalente ultrapassou 15 m neste exemplo.', tipo:'NÍVEL' },
  semsinal: { nivel:null, rotulo:'SEM SINAL', significado:'Sem medição atual para avaliar a faixa.', titulo:'Ausência de dados não significa nível zero', texto:'A última leitura deste exemplo foi 13,20 m equivalentes, há 3 minutos. Ela permanece no histórico, mas não recebe uma classificação de nível atual. A causa da interrupção precisa ser verificada.', evento:'Interrupção de recepção', detalhe:'Nenhuma nova leitura dentro da janela de 120 s do exemplo.', tipo:'COMUNICAÇÃO' },
  simulacao: { nivel:9.6, rotulo:'SIMULAÇÃO', significado:'Valor fictício para explorar o funcionamento.', titulo:'Simulação escolhida pelo usuário', texto:'Na proposta, este modo é ativado explicitamente. Uma falha de conexão não deve substituí-la automaticamente por dados fictícios. Este protótipo visual inteiro usa exemplos, inclusive as outras abas.', evento:'Simulação iniciada manualmente', detalhe:'Exemplo de identificação da origem dos dados nos eventos.', tipo:'SIMULAÇÃO' },
};
const escrever = (id, texto) => { document.getElementById(id).textContent = texto; };
const numero = (valor, casas=2) => valor.toLocaleString('pt-BR', {minimumFractionDigits:casas, maximumFractionDigits:casas});
function mostrarExemplo(chave) {
  const e = exemplos[chave];
  const ausente = e.nivel === null;
  document.getElementById('scenario').dataset.condition = chave;
  document.querySelectorAll('[data-state]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.state === chave)));
  escrever('state-label', e.rotulo);
  escrever('level', ausente ? '—' : numero(e.nivel));
  escrever('distance', ausente ? '—' : `${numero(40 - e.nivel / .5, 1)} cm`);
  escrever('pressure', ausente ? '—' : `${numero(e.nivel * 9.807, 1)} kPa`);
  escrever('meaning', e.significado);
  escrever('interpretation-title', e.titulo);
  escrever('interpretation-text', e.texto);
  escrever('connection', ausente ? 'Exemplo de recepção interrompida' : chave === 'simulacao' ? 'Modo de simulação ilustrado' : 'Exemplo de recepção ativa');
  escrever('freshness', ausente ? 'Última recepção no exemplo: há 3 min' : chave === 'simulacao' ? 'Sem recepção de instrumento' : 'Última recepção no exemplo: há 8 s');
  escrever('source-kind', 'CENÁRIO FICTÍCIO');
  escrever('event-name', e.evento); escrever('event-text', e.detalhe); escrever('event-tag', e.tipo);
  escrever('event-time', ausente ? 'há 3 min' : 'há 2 min');
  const altura = (e.nivel || 0) / 20 * 100;
  document.getElementById('water').style.height = `${altura}%`;
  document.getElementById('surface-marker').style.bottom = `${altura}%`;
  escrever('surface-value', ausente ? '—' : numero(e.nivel));
  const base = ausente ? 13.2 : e.nivel;
  const serie = [base-2.1,base-1.9,base-2,base-1.6,base-1.7,base-1.1,base-1.2,base-.7,base-.5,base-.7,base-.3,base];
  const points = serie.map((v,i) => [50 + i * (ausente ? 47 : 72.27), 205-v*9]);
  const caminho = points.map(([x,y],i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [x,y] = points.at(-1);
  document.getElementById('chart-line').setAttribute('d', caminho);
  document.getElementById('chart-area').setAttribute('d', `${caminho} L${x} 190 L50 190 Z`);
  document.getElementById('chart-point').setAttribute('cx', x);
  document.getElementById('chart-point').setAttribute('cy', y);
  escrever('chart-description', ausente ? 'Série fictícia interrompida: o gráfico termina na última leitura e não preenche a ausência com zero.' : `Série fictícia terminando em ${numero(e.nivel)} metros equivalentes. Limites de atenção em 12 e crítico em 15.`);
  escrever('trend-note', ausente ? 'Lacuna preservada · sem dados novos no exemplo' : 'Série fictícia · tendência apenas ilustrativa');
}
document.querySelectorAll('[data-state]').forEach(b => b.addEventListener('click', () => mostrarExemplo(b.dataset.state)));
mostrarExemplo('normal');
