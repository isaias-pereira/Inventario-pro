/**
 * Guias de Hortifrui — conteúdo do "Guia do Cliente".
 *
 * O QR code colado na banca abre a página pública `/g/<slug>`: uma tela
 * curta, em português do dia a dia, que ensina o cliente a escolher o produto
 * no ponto certo.
 *
 * O conteúdo é **versionado no código** (decisão do responsável): não há
 * migration nem endpoint — o que está aqui é o que vai para produção no
 * deploy. Para ajustar um texto, edite este arquivo.
 *
 * As ilustrações são SVG gerados em código (ver `IlustracaoProduto`): cada
 * produto tem 3 paletas, uma por estágio (espere / no ponto / passou).
 */

/** Palavras que ligam um produto do catálogo a um guia. */
export interface GuiaProduto {
  /** URL pública: /g/<slug> */
  slug: string;
  /**
   * Slugs antigos que continuam abrindo o guia. Serve para os QR codes já
   * impressos e colados nas bancas não quebrarem quando um guia é renomeado.
   */
  slugsAntigos?: string[];
  nome: string;
  familia: 'Frutas' | 'Legumes' | 'Verduras' | 'Raízes';
  /** Frase de promessa: o que o cliente vai aprender. */
  resumo: string;
  /** Tipo da ilustração (precisa existir em `IlustracaoProduto`). */
  tipo: TipoIlustracao;
  /** Palavras que casam com a descrição do produto no catálogo. */
  palavras: string[];
  passos: PassoGuia[];
  estagios: EstagioGuia[];
  /** Dica do encarregado: o detalhe que só quem trabalha no setor sabe. */
  dica: string;
  /** Como guardar em casa. */
  armazenamento: string;
}

export type TipoIlustracao =
  | 'tomate'
  | 'banana'
  | 'mamao'
  | 'abacate'
  | 'maca'
  | 'laranja'
  | 'melancia'
  | 'abacaxi'
  | 'batata'
  | 'cebola'
  | 'cenoura'
  | 'repolho'
  | 'alface';

export type IconePasso = 'olho' | 'toque' | 'cheiro' | 'peso' | 'som' | 'casca' | 'folha' | 'talo';

export interface PassoGuia {
  icone: IconePasso;
  titulo: string;
  texto: string;
}

/** Os estágios de um produto: ainda não, pode guardar, no ponto, passou. */
export type ChaveEstagio = 'espere' | 'guardar' | 'no-ponto' | 'passou';

export interface EstagioGuia {
  chave: ChaveEstagio;
  nome: string;
  /** Veredito curto, aparece em destaque. */
  veredito: string;
  descricao: string;
  /**
   * Foto do produto neste estado (`public/guias/`). É o que o cliente vê:
   * foto de verdade, não desenho.
   */
  foto?: string;
  /**
   * Qual desenho mostrar como reserva: 0 = ainda cru, 1 = no ponto, 2 = passado.
   * Por padrão usa a posição do estágio; produtos que não amadurecem
   * (batata, cebola, laranja…) apontam para o desenho "no ponto".
   */
  ilustracao?: 0 | 1 | 2;
}

export const GUIAS: GuiaProduto[] = [
  {
    slug: 'tomate',
    nome: 'Tomate',
    familia: 'Legumes',
    resumo: 'A cor diz o tempo, o toque diz o ponto. Aprenda a escolher o tomate que está no ponto hoje.',
    tipo: 'tomate',
    palavras: ['tomate'],
    passos: [
      { icone: 'olho', titulo: 'Olhe a cor', texto: 'O ombro alaranjado ou vermelho é o sinal de que está maduro. Se ainda tem um verde no alto, ele ripa em casa.' },
      { icone: 'toque', titulo: 'Toque de leve', texto: 'A pele deve ceder um pouco, sem estar mole. Pele lisa, sem rugas.' },
      { icone: 'cheiro', titulo: 'Cheire o talo', texto: 'Cheiro forte e doce é tomate no ponto. Sem cheiro nenhum? Ainda está verde.' },
      { icone: 'peso', titulo: 'Sinta o peso', texto: 'Dentro do mesmo tamanho, escolha o mais pesado: é o mais cheio de água e de sabor.' },
    ],
    estagios: [
      { chave: 'espere', foto: '/guias/tomate-1.webp', nome: 'Verde e firme', veredito: 'Espere 2 a 3 dias', descricao: 'Ombro ainda verde, casca dura e sem cheiro. Deixe em cima da pia, fora da geladeira, até amadurecer.' },
      { chave: 'no-ponto', foto: '/guias/tomate-2.webp', nome: 'Alaranjado e firme', veredito: 'Leve hoje', descricao: 'Cor uniforme e viva, cede um pouco ao toque e tem cheiro de tomate. Perfeito para hoje.' },
      { chave: 'passou', foto: '/guias/tomate-3.webp', nome: 'Mole ou manchado', veredito: 'Prefira outro', descricao: 'Escureceu, enrugou ou está mole demais: o sabor já passou. Se estiver machucado, escolha outro da banca.' },
    ],
    dica: 'Tomate maduro nunca vai para a geladeira: o frio mata o sabor. Guarde virado para baixo, em cima da pia.',
    armazenamento: 'Em cima da pia, virado para baixo e longe da luz. Depois de cortado, na geladeira por até 3 dias.',
  },
  {
    slug: 'banana-nanica',
    // O QR antigo das bancas foi impresso como "banana-prata": continua abrindo.
    slugsAntigos: ['banana-prata'],
    nome: 'Banana nanica',
    familia: 'Frutas',
    resumo: 'Verde é para esperar, amarela com pintas é para levar hoje. O truque está na casca.',
    tipo: 'banana',
    palavras: ['banana nanica', 'banana'],
    passos: [
      { icone: 'olho', titulo: 'Procure o amarelo', texto: 'A banana no ponto é amarela viva, com umas pintas marrons. Verde é banana que ainda vai demorar.' },
      { icone: 'casca', titulo: 'Veja a casca', texto: 'A casca deve estar intacta, sem áreas translúcidas, escorridas ou com mofo.' },
      { icone: 'talo', titulo: 'Olhe a ponta do cacho', texto: 'Ponta verde significa que a banana está mais dura por dentro, mesmo com a casca amarela.' },
      { icone: 'peso', titulo: 'Escolha a mais cheia', texto: 'Dentro do mesmo tamanho, a mais pesada é a mais gostosa.' },
    ],
    estagios: [
      { chave: 'espere', foto: '/guias/banana-prata-1.webp', nome: 'Verde', veredito: 'Espere 3 a 5 dias', descricao: 'Verde e dura. Ripa em cima da mesa, fora da geladeira. (A geladeira escurece a casca, mas não segura o amadurecimento.)' },
      { chave: 'no-ponto', foto: '/guias/banana-prata-2.webp', nome: 'Amarela com pintas', veredito: 'Leve hoje', descricao: 'Amarelo vivo com umas pintas marrons: doce e macia. Perfeita para comer hoje ou deixar amadurecer mais um dia.' },
      { chave: 'passou', foto: '/guias/banana-prata-3.webp', nome: 'Muito amarela e mole', veredito: 'Use logo', descricao: 'Escureceu e ficou mole: ainda rende bolo e vitamina, mas já passou do ponto para comer in natura.' },
    ],
    dica: 'Banana com pintas é a melhor para hoje. Banana verde é a melhor para esperar a semana toda.',
    armazenamento: 'Em cima da mesa, fora da geladeira. A banana madura descascada pode ser congelada para bolo e vitamina.',
  },
  {
    slug: 'mamao-papaia',
    nome: 'Mamão papaia',
    familia: 'Frutas',
    resumo: 'Cheiro doce e toque macio na base: só isso já diz que o mamão está pronto.',
    tipo: 'mamao',
    palavras: ['mamao papaia', 'mamão papaia', 'mamao', 'mamão'],
    passos: [
      { icone: 'cheiro', titulo: 'Cheire perto do talo', texto: 'Cheiro doce e perfumado é o sinal de que está no ponto. Sem cheiro, ainda está verde.' },
      { icone: 'toque', titulo: 'Aperte de leve', texto: 'Deve ceder um pouco, como a bochecha. Mole demais já passou.' },
      { icone: 'olho', titulo: 'Veja a cor', texto: 'A casca deve estar firme, verde ou amarela, sem áreas escuras ou moles.' },
    ],
    estagios: [
      { chave: 'espere', foto: '/guias/mamao-papaia-1.webp', nome: 'Verde e duro', veredito: 'Espere 3 a 5 dias', descricao: 'Verde, firme e sem cheiro. Deixe em cima da mesa até amadurecer.' },
      { chave: 'no-ponto', foto: '/guias/mamao-papaia-2.webp', nome: 'Meio amarelo, cheiro doce', veredito: 'Coma hoje', descricao: 'Metade amarela, cheiro doce e toque macio: está no ponto.' },
      { chave: 'passou', foto: '/guias/mamao-papaia-3.webp', nome: 'Muito amarelo e mole', veredito: 'Use logo', descricao: 'Muito macio, com pontos fundidos: rende vitamina e bolo. Se estiver com cheiro forte, prefira outro da banca.' },
    ],
    dica: 'Mamão é fruta de poucos dias: compre quando ainda estiver firme e deixe em casa, na temperatura ambiente.',
    armazenamento: 'Em cima da mesa até amadurecer. Depois, na geladeira por 2 a 3 dias — ou corte e congele.',
  },
  {
    slug: 'abacate',
    nome: 'Abacate',
    familia: 'Frutas',
    resumo: 'Aperte de leve: cede um pouco = está no ponto para hoje. Mais firme = espere alguns dias.',
    tipo: 'abacate',
    palavras: ['abacate'],
    passos: [
      { icone: 'toque', titulo: 'Aperte com o polegar', texto: 'Cede pouco, está no ponto. Cede muito, passou do ponto. Não cede nada, ainda está verde.' },
      { icone: 'olho', titulo: 'Veja a casca', texto: 'Verde escuro e sem manchas é a melhor para levar e amadurecer em casa.' },
      { icone: 'cheiro', titulo: 'Cheire o talo', texto: 'Cheiro leve e de terra = pronto. Sem cheiro = ainda verde.' },
    ],
    estagios: [
      { chave: 'espere', foto: '/guias/abacate-1.webp', nome: 'Verde e duro', veredito: 'Espere 3 a 4 dias', descricao: 'Verde escuro e firme: ripe em cima da mesa. Para acelerar, coloque ao lado de uma banana.' },
      { chave: 'no-ponto', foto: '/guias/abacate-2.webp', nome: 'Cede um pouco ao toque', veredito: 'Leve hoje', descricao: 'Macio no ponto certo, sem marcas: perfeito para hoje — em fatia, no molho ou no guacamole.' },
      { chave: 'passou', foto: '/guias/abacate-3.webp', nome: 'Muito mole ou manchado', veredito: 'Use logo', descricao: 'Passou do ponto: ainda rende vitamina e guacamole. Com fibras marrons ou cheiro forte, escolha outro da banca.' },
    ],
    dica: 'Quer amadurecer rápido? Coloque o abacate ao lado de uma banana: o gás que a banana solta acelera o processo.',
    armazenamento: 'Em cima da mesa até amadurecer. Depois, na geladeira por 3 a 4 dias.',
  },
  {
    slug: 'maca',
    nome: 'Maçã',
    familia: 'Frutas',
    resumo: 'Firme, sem amassado e com cor viva: é assim que a maçã boa chega em casa.',
    tipo: 'maca',
    palavras: ['maca', 'maçã', 'maca gala', 'maçã gala', 'maca fuji', 'maçã fuji'],
    passos: [
      { icone: 'olho', titulo: 'Olhe a cor', texto: 'Prefira cor viva e uniforme. Maçã com cara de amarela e sem brilho costuma ser mais fraca.' },
      { icone: 'toque', titulo: 'Toque na casca', texto: 'Firme ao toque, sem ceder. Se afundar com o dedo, já passou do ponto.' },
      { icone: 'casca', titulo: 'Procure amassados', texto: 'Sem marcas de queda, sem pontos escuros e sem casca enrugada.' },
      { icone: 'peso', titulo: 'Escolha a mais pesada', texto: 'Maçã boa pesa na mão. Na dúvida, leve a mais pesada do mesmo tamanho.' },
    ],
    estagios: [
      { chave: 'espere', foto: '/guias/maca-1.webp', nome: 'Firme e sem brilho', veredito: 'Espere 1 a 2 dias', descricao: 'Dura e sem brilho: ainda sem açúcar. Deixe fora da geladeira por um ou dois dias.' },
      { chave: 'no-ponto', foto: '/guias/maca-2.webp', nome: 'Firme e com brilho', veredito: 'Leve hoje', descricao: 'Firme, pesada na mão e com brilho na casca: doce e crocante — o melhor estado.' },
      { chave: 'passou', foto: '/guias/maca-3.webp', nome: 'Moles ou com manchas', veredito: 'Use logo', descricao: 'Murcha, amassa ao toque ou tem manchas: o sabor já passou. Ainda dá para bolo e compota — cozinhe logo.' },
    ],
    dica: 'Maçã boa pesa na mão. Dentro da mesma caixa, a mais pesada é quase sempre a mais doce.',
    armazenamento: 'Na geladeira, dentro de um saco perfurado ou na caixa da gaveta: dura até 2 semanas.',
  },
  {
    slug: 'laranja',
    nome: 'Laranja',
    familia: 'Frutas',
    resumo: 'Pesada, firme e com casca lisa: assim a laranja está cheia de suco.',
    tipo: 'laranja',
    palavras: ['laranja', 'laranja pera', 'laranja-pera'],
    passos: [
      { icone: 'peso', titulo: 'Escolha a mais pesada', texto: 'Do mesmo tamanho, a laranja mais pesada é a mais cheia de suco.' },
      { icone: 'casca', titulo: 'Veja a casca', texto: 'Casca lisa e firme, sem áreas enrugadas ou pontos escuros.' },
      { icone: 'toque', titulo: 'Toque de leve', texto: 'Firme, com uma leve elasticidade. Frouxa demais já passou do ponto.' },
    ],
    estagios: [
      { chave: 'guardar', foto: '/guias/laranja-1.webp', nome: 'Firme e sem brilho', veredito: 'Pode guardar', descricao: 'Firme e sem brilho: dura bem e aguenta alguns dias na fruteira. Guarde em cima da mesa, longe do sol.', ilustracao: 1 },
      { chave: 'no-ponto', foto: '/guias/laranja-2.webp', nome: 'Pesada e perfumada', veredito: 'Esprema hoje', descricao: 'Pesada na mão, firme e com cheiro forte na casca: está cheia de suco.', ilustracao: 1 },
      { chave: 'passou', foto: '/guias/laranja-3.webp', nome: 'Murcha ou com bolhas', veredito: 'Use logo', descricao: 'Murcha ou com casca frouxa: rende suco na hora. Se tiver bolhas de mofo, escolha outra.', ilustracao: 2 },
    ],
    dica: 'Laranja com casca e pele é sempre melhor para suco. Descascada, é para comer na hora.',
    armazenamento: 'Em cima da mesa por até 3 dias. Na geladeira, com as folhas, dura 2 a 3 semanas.',
  },
  {
    slug: 'melancia',
    nome: 'Melancia',
    familia: 'Frutas',
    resumo: 'O som e a cor da sola dizem se ela está pronta: bata com o dedo e procure o amarelado.',
    tipo: 'melancia',
    palavras: ['melancia', 'melância'],
    passos: [
      { icone: 'som', titulo: 'Bata com o dedo', texto: 'Som grave e oco é o sinal de que está no ponto. Som metálico, de "toc", indica que passou.' },
      { icone: 'olho', titulo: 'Olhe a parte de baixo', texto: 'A parte que fica no chão deve estar amarelada (ou quase branca). Verde é melancia sem doçura.' },
      { icone: 'peso', titulo: 'Escolha a mais pesada', texto: 'Melancia boa pesa para o tamanho. Leve as mais pesadas, sem rachaduras.' },
    ],
    estagios: [
      { chave: 'espere', foto: '/guias/melancia-1.webp', nome: 'Verde e clara embaixo', veredito: 'Prefira outra', descricao: 'Casca verde e parte de baixo ainda clara: essa costuma ter pouca doçura. Escolha outra, com a sola amarelada.' },
      { chave: 'no-ponto', foto: '/guias/melancia-2.webp', nome: 'Verde com sola amarela', veredito: 'Corte e sirva', descricao: 'A casca tem o verde listrado e embaixo já amareleceu: doce e suculenta. Corte ao meio para conferir.' },
      { chave: 'passou', foto: '/guias/melancia-3.webp', nome: 'Muito amarela, mole ou rachada', veredito: 'Prefira outra', descricao: 'Passou do ponto: casca muito amarelada ou rachada. A textura fica parecendo água: escolha outra firme.' },
    ],
    dica: 'Bata com o dedo: "tum" grave é ponto certo, "toc" metálico é melancia passando do ponto.',
    armazenamento: 'Em temperatura ambiente por até 2 dias. Depois, na geladeira por 3 a 4 dias — corte só o que for comer.',
  },
  {
    slug: 'abacaxi',
    nome: 'Abacaxi',
    familia: 'Frutas',
    resumo: 'Casca dourada e folha viva: assim o abacaxi está no ponto.',
    tipo: 'abacaxi',
    palavras: ['abacaxi'],
    passos: [
      { icone: 'olho', titulo: 'Veja a cor da casca', texto: 'Dourado uniforme é o ponto certo. Verde é abacaxi que precisa de dias.' },
      { icone: 'folha', titulo: 'Olhe as folhas da copa', texto: 'Folhas verdes e firmes = fruta fresca. Folhas marrons e secas = a fruta já está há muito tempo na prateleira.' },
      { icone: 'cheiro', titulo: 'Cheire a base', texto: 'Cheiro doce na base é o melhor sinal. Cheiro forte e fermentado é ruim sinal.' },
    ],
    estagios: [
      { chave: 'espere', foto: '/guias/abacaxi-1.webp', nome: 'Casca verde', veredito: 'Espere 2 a 4 dias', descricao: 'Ainda verde: guarde em cima da mesa, com a ponta para baixo, até dourar.' },
      { chave: 'no-ponto', foto: '/guias/abacaxi-2.webp', nome: 'Dourado, folha viva', veredito: 'Leve hoje', descricao: 'Casca dourada, folha verde e cheiro doce: pronto para comer hoje.' },
    ],
    dica: 'Abacaxi maduro cheira a mel na base. Se o cheiro vier forte e fermentado, ou a casca estiver escura e mole, ele passou do ponto — escolha outro.',
    armazenamento: 'Em cima da mesa até dourar. Depois, na geladeira por até 3 dias.',
  },
  {
    slug: 'batata',
    nome: 'Batata',
    familia: 'Legumes',
    resumo: 'Firme, sem broto verde e sem olhos moles: é a que frita bem.',
    tipo: 'batata',
    palavras: ['batata'],
    passos: [
      { icone: 'olho', titulo: 'Procure partes verdes', texto: 'Qualquer área verde ou broto é sinal de que ficou muito tempo guardada. Se tiver, prefira outra.' },
      { icone: 'toque', titulo: 'Aperte de leve', texto: 'Firme e dura. Batata que afunda com o dedo está velha e murcha.' },
      { icone: 'casca', titulo: 'Olhe os "olhos"', texto: 'Olhos pequenos e fundos, sem broto, é o ideal. Olhos fundos e escuros são de batata velha: prefira outra.' },
    ],
    estagios: [
      { chave: 'guardar', foto: '/guias/batata-1.webp', nome: 'Firme e sem broto', veredito: 'Pode guardar', descricao: 'Firme, sem broto e sem partes escuras: aguenta bem guardado, em local fresco, escuro e arejado.', ilustracao: 1 },
      { chave: 'no-ponto', foto: '/guias/batata-2.webp', nome: 'Firme e de casca lisa', veredito: 'Cozinhe hoje', descricao: 'Firme, sem broto verde e sem marcas de umidade: boa para cozinhar ou fritar hoje.', ilustracao: 1 },
      { chave: 'passou', foto: '/guias/batata-3.webp', nome: 'Murcha ou brotada', veredito: 'Prefira outra', descricao: 'Brotou, murchou ou tem partes verdes: o gosto fica amargo. Escolha uma batata firme, sem broto.', ilustracao: 2 },
    ],
    dica: 'Guarde a batata longe da luz e da cebola: a luz gera broto verde e a cebola faz a batata murchar mais rápido.',
    armazenamento: 'Em local fresco, escuro e arejado — dentro de um saco de papel, nunca na geladeira.',
  },
  {
    slug: 'cebola',
    nome: 'Cebola',
    familia: 'Legumes',
    resumo: 'Firme, seca e sem broto: é a cebola boa para temperar e para guardar.',
    tipo: 'cebola',
    palavras: ['cebola'],
    passos: [
      { icone: 'casca', titulo: 'Veja a casca', texto: 'Casca lisa e seca, sem manchas escuras nem mofo.' },
      { icone: 'toque', titulo: 'Sinta o peso', texto: 'Firme e pesada na mão. Cebola que rola leve e frouxa já passou.' },
      { icone: 'olho', titulo: 'Olhe o topo', texto: 'Sem broto verde no topo: com broto, o sabor fica mais forte e amargo.' },
    ],
    estagios: [
      { chave: 'guardar', foto: '/guias/cebola-1.webp', nome: 'Firme, seca e sem broto', veredito: 'Pode guardar', descricao: 'Casca lisa, firme e sem broto: boa para temperar hoje ou guardar na gaveta, em local seco e escuro.', ilustracao: 1 },
      { chave: 'passou', foto: '/guias/cebola-2.webp', nome: 'Brotada, mole ou com mofo', veredito: 'Prefira outra', descricao: 'Com broto, murcha ou mofo no fundo: o sabor fica forte e amargo. Escolha outra cebola firme e seca.', ilustracao: 2 },
    ],
    dica: 'Cebola com cheiro forte e olhos secos é velha: guarde a última no fundo da gaveta, longe das outras.',
    armazenamento: 'Em local seco, arejado e escuro, fora da geladeira. Nunca guarde junto com a batata.',
  },
  {
    slug: 'cenoura',
    nome: 'Cenoura',
    familia: 'Raízes',
    resumo: 'Firme, sem rachaduras e com folha verde: está fresca e doce.',
    tipo: 'cenoura',
    palavras: ['cenoura'],
    passos: [
      { icone: 'olho', titulo: 'Veja a cor', texto: 'Laranja viva e uniforme. Parte branca ou amarelada no topo é sinal de que perdeu doçura.' },
      { icone: 'toque', titulo: 'Aperte de leve', texto: 'Firme, sem ceder. Cenoura mole e ressecada perdeu o açúcar.' },
      { icone: 'casca', titulo: 'Procure rachaduras', texto: 'Rachaduras, marcas de faca ou pontos escuros: prefira outra — a cenoura apodrece mais rápido ali.' },
      { icone: 'folha', titulo: 'Veja se tem folha', texto: 'Com folha verde, foi colhida recentemente e está mais doce.' },
    ],
    estagios: [
      { chave: 'guardar', foto: '/guias/cenoura-1.webp', nome: 'Firme e cor viva', veredito: 'Pode guardar', descricao: 'Firme, sem rachaduras e com laranja vivo: dá para guardar 2 semanas na geladeira. Tire a folha antes.', ilustracao: 1 },
      { chave: 'passou', foto: '/guias/cenoura-2.webp', nome: 'Murcha ou ressecada', veredito: 'Use logo', descricao: 'Murcha, com pontas ressecadas ou desbotadas: perdeu o açúcar, mas ainda rende sopa e purê. Cozinhe logo.', ilustracao: 2 },
    ],
    dica: 'Cenoura com folha verde é a melhor: a folha mostra que foi colhida há pouco. Para conservar sabor e crocância, guarde na geladeira em um recipiente com água (mergulhada) — troque a água a cada 2 dias.',
    armazenamento: 'Na geladeira, dentro de um saco plástico e sem a folha, por até 2 semanas. Para máxima crocância: mergulhada em água num pote fechado, trocando a água a cada 2 dias.',
  },
  {
    slug: 'repolho',
    nome: 'Repolho',
    familia: 'Verduras',
    resumo: 'Pesado, firme e com folhas externas verdes: esse é o repolho bom.',
    tipo: 'repolho',
    palavras: ['repolho', 'repolho branco', 'repolho roxo'],
    passos: [
      { icone: 'peso', titulo: 'Escolha o mais pesado', texto: 'Do mesmo tamanho, o mais pesado é o mais firme e com mais folha dentro.' },
      { icone: 'folha', titulo: 'Olhe as folhas de fora', texto: 'Firmes, verdes e grudadas na cabeça: o repolho está fresco. Folhas frouxas ou amareladas? Prefira outro.' },
      { icone: 'casca', titulo: 'Veja a base cortada', texto: 'A base (o talo) deve estar branca e firme, sem escurecimento.' },
    ],
    estagios: [
      { chave: 'guardar', foto: '/guias/repolho-1.webp', nome: 'Bem fechado e firme', veredito: 'Melhor para guardar', descricao: 'Cabeça fechada, firme e pesada: é o melhor estado para guardar. Na geladeira dura até 10 dias — corte só o que for usar.', ilustracao: 1 },
      { chave: 'passou', foto: '/guias/repolho-2.webp', nome: 'Folhas amareladas e frouxas', veredito: 'Prefira outra', descricao: 'Cabeça frouxa, folhas externas amareladas ou marrons: já passou. Escolha outro repolho mais fechado e pesado.', ilustracao: 2 },
    ],
    dica: 'Corte o repolho pela metade, não em gomos: as folhas de fora continuam protegendo o miolo por mais tempo.',
    armazenamento: 'Na geladeira, em saco ou pote, por até 10 dias. O miolo cortado dura menos.',
  },
  {
    slug: 'alface',
    nome: 'Alface',
    familia: 'Verduras',
    resumo: 'Folhas firmes, vivas e sem borda marrom: a alface está fresca.',
    tipo: 'alface',
    palavras: ['alface', 'alface crespa', 'alface americana', 'alface romana'],
    passos: [
      { icone: 'folha', titulo: 'Veja as folhas', texto: 'Firmes, verdes e abertas de leve: alface fresca. Folhas murchas e caídas não voltam.' },
      { icone: 'casca', titulo: 'Olhe a borda', texto: 'Borda sem marrom ou preto. A borda é a primeira parte a passar do ponto.' },
      { icone: 'cheiro', titulo: 'Cheire a base', texto: 'Cheiro fresco e leve. Se a base já estiver escurecida ou com cheiro estranho, prefira outra.' },
    ],
    estagios: [
      { chave: 'guardar', foto: '/guias/alface-1.webp', nome: 'Fechada e firme', veredito: 'Melhor para guardar', descricao: 'Bem fechada, de folhas firmes: é o melhor estado para guardar — crocante e durável. Na geladeira aguenta 3 a 5 dias.', ilustracao: 1 },
      { chave: 'no-ponto', foto: '/guias/alface-2.webp', nome: 'Folhas crocantes e claras', veredito: 'Use hoje', descricao: 'Folhas soltas, crocantes, de cor viva e sem marcas: está no ponto para salada hoje.', ilustracao: 1 },
      { chave: 'passou', foto: '/guias/alface-3.webp', nome: 'Murcha ou com borda marrom', veredito: 'Prefira outra', descricao: 'Murcha, com borda marrom ou base escurecida: alface murchada não revive. Escolha outra, com as folhas firmes.', ilustracao: 2 },
    ],
    dica: 'Lave a alface só na hora de usar: ela guarda melhor seca na geladeira.',
    armazenamento: 'Na geladeira, dentro de um pote ou de um saco com papel toalha, por 3 a 5 dias.',
  },
];

/** Busca um guia pelo slug (usado pela rota pública `/g/:slug`). */
export function buscarGuia(slug: string): GuiaProduto | undefined {
  if (!slug) return undefined;
  const alvo = slug.trim().toLowerCase();
  return GUIAS.find(
    (guia) => guia.slug === alvo || (guia.slugsAntigos ?? []).includes(alvo),
  );
}

/** URL pública do guia. Usa a origem atual (local em dev, domínio em produção). */
export function urlGuia(slug: string, origem?: string): string {
  const base = origem ?? origemAtual();
  return `${base}/g/${slug}`;
}

/**
 * Foto de capa do guia: o produto no estado ideal ("no ponto"). Serve para a
 * imagem grande do topo e para a miniatura nas listas.
 */
export function fotoPrincipal(guia: GuiaProduto): string | undefined {
  const noPonto = guia.estagios.find((estagio) => estagio.chave === 'no-ponto');
  return (noPonto ?? guia.estagios[0])?.foto;
}

/**
 * Origem do navegador — `globalThis` em vez de `window` para o arquivo
 * continuar tipando no tsconfig do Node (o script do sitemap importa daqui).
 */
function origemAtual(): string {
  const g = globalThis as typeof globalThis & { location?: { origin?: string } };
  return g.location?.origin ?? '';
}

/** Tira acentos e caixa: "Mamão Papaia" -> "mamao papaia". */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Procura o guia que casa com a descrição de um produto do catálogo.
 * Usado para oferecer o "Guia do cliente" na tela interna de Consulta.
 */
export function guiaParaDescricao(descricao: string): GuiaProduto | undefined {
  const texto = normalizarTexto(descricao);
  if (!texto) return undefined;
  return GUIAS.find((guia) =>
    guia.palavras.some((palavra) => texto.includes(normalizarTexto(palavra))),
  );
}
