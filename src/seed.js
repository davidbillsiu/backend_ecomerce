require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, Usuario, Endereco, Categoria, Ambiente, Marca, Produto, VariacaoSku, ImagemProduto, Cupom } = require('./models');

const IMG = (n) => `img/produtos/${n}.svg`;

module.exports = async function seed() {
  // ---- usuários (admin, logística, cliente demo)
  if ((await Usuario.count()) === 0) {
    const hash = (s) => bcrypt.hashSync(s, 10);
    await Usuario.bulkCreate([
      { nome_completo: 'Administrador', email: process.env.ADMIN_EMAIL || 'admin@moveis.com', senha_hash: hash(process.env.ADMIN_PASSWORD || 'Admin@123'), tipo_perfil: 'admin' },
      { nome_completo: 'Equipe Logística', email: 'logistica@moveis.com', senha_hash: hash('Logistica@123'), tipo_perfil: 'logistica' },
    ]);
    const cli = await Usuario.create({ nome_completo: 'Cliente Demo', email: 'cliente@moveis.com', senha_hash: hash('Cliente@123'), cpf_cnpj: '52998224725', telefone: '48999990000' });
    await Endereco.create({ usuario_id: cli.id, apelido: 'Casa', cep: '88010001', logradouro: 'Rua Felipe Schmidt', numero: '100', bairro: 'Centro', cidade: 'Florianópolis', estado: 'SC', principal: true });
    console.log('Seed: usuários criados (admin / logística / cliente demo).');
  }
  if ((await Produto.count()) > 0) return;

  // ---- catálogo
  const sofas = await Categoria.create({ nome: 'Sofás', slug: 'sofas' });
  await Categoria.create({ nome: 'Sofás Retráteis', slug: 'sofas-retrateis', categoria_pai_id: sofas.id });
  const cat = {};
  for (const n of ['Mesas', 'Camas', 'Estantes e Racks', 'Cadeiras', 'Guarda-roupas']) cat[n] = await Categoria.create({ nome: n, slug: n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') });
  cat.Sofas = sofas; cat.Retrateis = await Categoria.findOne({ where: { slug: 'sofas-retrateis' } });

  const amb = {};
  for (const [n, d] of [['Sala de Estar', 'Conforto para receber e relaxar'], ['Sala de Jantar', 'Mesas e cadeiras para boas refeições'], ['Quarto', 'Descanso e organização'], ['Escritório', 'Produtividade em casa']])
    amb[n] = await Ambiente.create({ nome: n, descricao: d });

  const m1 = await Marca.create({ nome: 'Conforto Casa', cnpj: '11222333000181', prazo_producao_dias: 5 });
  const m2 = await Marca.create({ nome: 'Madeira Nobre', cnpj: '45997418000153', prazo_producao_dias: 10 });
  const m3 = await Marca.create({ nome: 'Linha Própria', prazo_producao_dias: 0 });

  const produtos = [
    { nome: 'Sofá Retrátil Nuvem', cat: cat.Retrateis, marca: m1, mat: 'Madeira de eucalipto e espuma D33', montagem: false, amb: ['Sala de Estar'], desc: 'Sofá retrátil e reclinável de 3 lugares, assento profundo e tecido suede.',
      vars: [['SOFA-NUV-CZ', 'Cinza', 'Suede', 3490, 2890, [90, 230, 100, 62, 2, 8], 'sofa-retratil-nuvem-cinza'], ['SOFA-NUV-AR', 'Areia', 'Suede', 3490, 2890, [90, 230, 100, 62, 2, 3], 'sofa-retratil-nuvem-areia']] },
    { nome: 'Sofá 3 Lugares Oslo', cat: cat.Sofas, marca: m1, mat: 'Madeira de pinus e espuma D28', montagem: false, amb: ['Sala de Estar'], desc: 'Design escandinavo com pés palito e almofadas soltas.',
      vars: [['SOFA-OSL-VD', 'Verde Musgo', 'Linho', null, 2190, [85, 210, 90, 48, 1, 5], 'sofa-3-lugares-oslo-verde']] },
    { nome: 'Mesa de Jantar Industrial', cat: cat.Mesas, marca: m2, mat: 'Madeira Maciça', montagem: true, amb: ['Sala de Jantar'], desc: 'Tampo em madeira maciça e estrutura de aço, para 6 a 8 lugares.',
      vars: [['MESA-IND-180-FRE', 'Freijó / Preto', null, 2290, 1890, [78, 180, 90, 55, 2, 6], 'mesa-jantar-industrial-freijo'], ['MESA-IND-180-NOG', 'Nogueira / Preto', null, null, 1990, [78, 180, 90, 55, 2, 0], 'mesa-jantar-industrial-nogueira']] },
    { nome: 'Mesa de Centro Orgânica', cat: cat.Mesas, marca: m3, mat: 'MDF com laminado natural', montagem: true, amb: ['Sala de Estar'], desc: 'Formato orgânico que se adapta a qualquer sala.',
      vars: [['MESA-CEN-ORG', 'Carvalho', null, null, 690, [40, 90, 60, 12, 1, 12], 'mesa-centro-organica']] },
    { nome: 'Cama Box Casal Aurora', cat: cat.Camas, marca: m1, mat: 'Madeira e espuma', montagem: true, amb: ['Quarto'], desc: 'Cama box casal com baú e cabeceira estofada.',
      vars: [['CAMA-AUR-CAS', 'Marrom', 'Courino', 1890, 1590, [45, 138, 188, 60, 3, 4], 'cama-box-casal-aurora']] },
    { nome: 'Cama Solteiro Pinus', cat: cat.Camas, marca: m2, mat: 'Pinus maciço', montagem: true, amb: ['Quarto'], desc: 'Cama de solteiro robusta em pinus tratado.',
      vars: [['CAMA-PIN-SOL', 'Natural', null, null, 590, [35, 88, 198, 22, 1, 15], 'cama-solteiro-pinus']] },
    { nome: 'Estante Livros Modular', cat: cat['Estantes e Racks'], marca: m3, mat: 'MDF 15mm', montagem: true, amb: ['Sala de Estar', 'Escritório'], desc: 'Estante com nichos, monte do jeito que quiser.',
      vars: [['EST-MOD-NOG', 'Nogueira', null, null, 790, [180, 80, 30, 35, 2, 10], 'estante-livros-modular']] },
    { nome: 'Rack TV Linea', cat: cat['Estantes e Racks'], marca: m3, mat: 'MDF 18mm', montagem: true, amb: ['Sala de Estar'], desc: 'Rack para TVs até 65", com passagem de fios.',
      vars: [['RACK-LIN-PT', 'Preto Fosco', null, 1090, 890, [50, 180, 35, 30, 1, 2], 'rack-tv-linea']] },
    { nome: 'Cadeira de Jantar Bistrô', cat: cat.Cadeiras, marca: m2, mat: 'Madeira maciça', montagem: true, amb: ['Sala de Jantar'], desc: 'Cadeira com assento anatômico.',
      vars: [['CAD-BIS-MEL', 'Mel', null, null, 290, [88, 42, 48, 4.5, 1, 40], 'cadeira-jantar-bistro']] },
    { nome: 'Cadeira Escritório Ergo', cat: cat.Cadeiras, marca: m3, mat: 'Tela mesh e nylon', montagem: true, amb: ['Escritório'], desc: 'Ergonômica com ajuste de altura e apoio lombar.',
      vars: [['CAD-ERG-PT', 'Grafite', 'Mesh', 899, 749, [120, 62, 62, 13, 1, 9], 'cadeira-escritorio-ergo']] },
    { nome: 'Guarda-Roupa 6 Portas Prime', cat: cat['Guarda-roupas'], marca: m2, mat: 'MDF 18mm', montagem: true, amb: ['Quarto'], desc: 'Amplo, com espelho e gavetas com amortecimento.',
      vars: [['GR-PRI-6P', 'Areia', null, 2890, 2490, [240, 270, 52, 130, 4, 3], 'guarda-roupa-6-portas-prime']] },
    { nome: 'Guarda-Roupa 3 Portas Compacto', cat: cat['Guarda-roupas'], marca: m3, mat: 'MDF 15mm', montagem: true, amb: ['Quarto'], desc: 'Ideal para quartos pequenos.',
      vars: [['GR-COM-3P', 'Branco', null, null, 1190, [200, 120, 48, 55, 2, 7], 'guarda-roupa-3-portas-compacto']] },
  ];

  for (const p of produtos) {
    const slug = p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const prod = await Produto.create({ categoria_id: p.cat.id, marca_id: p.marca.id, nome: p.nome, slug, descricao_detalhada: p.desc, material_principal: p.mat, requer_montagem: p.montagem, garantia_meses: p.marca === m3 ? 6 : 12 });
    await prod.setAmbientes(p.amb.map((a) => amb[a]));
    let ordem = 0;
    for (const [sku, cor, tec, de, por, [alt, larg, prof, peso, vol, est], img] of p.vars) {
      const v = await VariacaoSku.create({ produto_id: prod.id, sku_codigo: sku, cor_acabamento: cor, revestimento_tecido: tec, preco_de: de, preco_por: por, altura_cm: alt, largura_cm: larg, profundidade_cm: prof, peso_kg: peso, quantidade_volumes: vol, estoque_atual: est });
      await ImagemProduto.create({ produto_id: prod.id, variacao_sku_id: v.id, url_imagem: IMG(img), alt_text: `${p.nome} - ${cor}`, ordem_exibicao: ordem++ });
    }
  }
  const agora = new Date(); const fim = new Date(); fim.setFullYear(fim.getFullYear() + 1);
  await Cupom.bulkCreate([
    { codigo: 'BEMVINDO10', tipo_desconto: 'percentual', valor_desconto: 10, valor_minimo_pedido: 500, validade_inicio: agora, validade_fim: fim, limite_usos: null },
    { codigo: 'MOVEIS200', tipo_desconto: 'valor_fixo', valor_desconto: 200, valor_minimo_pedido: 1500, validade_inicio: agora, validade_fim: fim, limite_usos: 100 },
    { codigo: 'FRETEGRATIS', tipo_desconto: 'frete_gratis', valor_desconto: 0, valor_minimo_pedido: 800, validade_inicio: agora, validade_fim: fim, limite_usos: null },
  ]);
  console.log('Seed: catálogo de exemplo criado.');
};

if (require.main === module) {
  (async () => { await sequelize.authenticate(); await sequelize.sync(); await module.exports(); await sequelize.close(); })().catch((e) => { console.error(e); process.exit(1); });
}
