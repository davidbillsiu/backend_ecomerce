const { DataTypes: T } = require('sequelize');
const sequelize = require('../config/database');

const def = (name, table, attrs, opts = {}) => sequelize.define(name, attrs, { tableName: table, ...opts });
const pk = { type: T.INTEGER, primaryKey: true, autoIncrement: true };
const money = (nullable = false, dflt) => ({ type: T.DECIMAL(10, 2), allowNull: nullable, ...(dflt !== undefined && { defaultValue: dflt }) });

// ===== Módulo 1: Cadastro e Login =====
const Usuario = def('Usuario', 'usuarios', {
  id: pk,
  nome_completo: { type: T.STRING, allowNull: false },
  email: { type: T.STRING, allowNull: false, unique: true },
  senha_hash: { type: T.STRING, allowNull: false },
  cpf_cnpj: { type: T.STRING, allowNull: true, unique: true },
  telefone: { type: T.STRING, allowNull: true },
  tipo_perfil: { type: T.ENUM('cliente', 'admin', 'logistica'), allowNull: false, defaultValue: 'cliente' },
  ativo: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
  criado_em: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
});

const Endereco = def('Endereco', 'enderecos', {
  id: pk,
  usuario_id: { type: T.INTEGER, allowNull: false },
  apelido: T.STRING,
  cep: { type: T.STRING, allowNull: false },
  logradouro: { type: T.STRING, allowNull: false },
  numero: { type: T.STRING, allowNull: false },
  complemento: T.STRING,
  bairro: { type: T.STRING, allowNull: false },
  cidade: { type: T.STRING, allowNull: false },
  estado: { type: T.STRING(2), allowNull: false },
  principal: { type: T.BOOLEAN, allowNull: false, defaultValue: false },
});

// ===== Módulo 2: Catálogo =====
const Categoria = def('Categoria', 'categorias', {
  id: pk,
  categoria_pai_id: { type: T.INTEGER, allowNull: true },
  nome: { type: T.STRING, allowNull: false },
  slug: { type: T.STRING, allowNull: false, unique: true },
  ativa: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
});

const Ambiente = def('Ambiente', 'ambientes', {
  id: pk,
  nome: { type: T.STRING, allowNull: false, unique: true },
  descricao: T.TEXT,
  imagem_banner_url: T.STRING,
});

const Marca = def('Marca', 'marcas_fabricantes', {
  id: pk,
  nome: { type: T.STRING, allowNull: false, unique: true },
  cnpj: { type: T.STRING, allowNull: true, unique: true },
  prazo_producao_dias: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
});

const Produto = def('Produto', 'produtos', {
  id: pk,
  categoria_id: { type: T.INTEGER, allowNull: false },
  marca_id: { type: T.INTEGER, allowNull: false },
  nome: { type: T.STRING, allowNull: false },
  slug: { type: T.STRING, allowNull: false, unique: true },
  descricao_detalhada: T.TEXT,
  material_principal: { type: T.STRING, allowNull: false },
  requer_montagem: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
  manual_montagem_pdf_url: T.STRING,
  garantia_meses: { type: T.INTEGER, allowNull: false, defaultValue: 3 },
  ativo: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
});

const ProdutoAmbiente = def('ProdutoAmbiente', 'produto_ambientes', {
  produto_id: { type: T.INTEGER, primaryKey: true, allowNull: false },
  ambiente_id: { type: T.INTEGER, primaryKey: true, allowNull: false },
});

const VariacaoSku = def('VariacaoSku', 'variacoes_sku', {
  id: pk,
  produto_id: { type: T.INTEGER, allowNull: false },
  sku_codigo: { type: T.STRING, allowNull: false, unique: true },
  cor_acabamento: { type: T.STRING, allowNull: false },
  revestimento_tecido: T.STRING,
  preco_de: money(true),
  preco_por: money(false),
  altura_cm: { type: T.DECIMAL(6, 2), allowNull: false },
  largura_cm: { type: T.DECIMAL(6, 2), allowNull: false },
  profundidade_cm: { type: T.DECIMAL(6, 2), allowNull: false },
  peso_kg: { type: T.DECIMAL(8, 2), allowNull: false },
  quantidade_volumes: { type: T.INTEGER, allowNull: false, defaultValue: 1 },
  estoque_atual: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
});

const ImagemProduto = def('ImagemProduto', 'imagens_produto', {
  id: pk,
  produto_id: { type: T.INTEGER, allowNull: false },
  variacao_sku_id: { type: T.INTEGER, allowNull: true },
  url_imagem: { type: T.STRING, allowNull: false },
  alt_text: T.STRING,
  ordem_exibicao: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
});

// ===== Módulo 3: Carrinho e Cupons =====
const Cupom = def('Cupom', 'cupons_desconto', {
  id: pk,
  codigo: { type: T.STRING, allowNull: false, unique: true },
  tipo_desconto: { type: T.ENUM('percentual', 'valor_fixo', 'frete_gratis'), allowNull: false },
  valor_desconto: money(false, 0),
  valor_minimo_pedido: money(false, 0),
  validade_inicio: { type: T.DATE, allowNull: false },
  validade_fim: { type: T.DATE, allowNull: false },
  limite_usos: { type: T.INTEGER, allowNull: true },
  usos_atuais: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
});

const Carrinho = def('Carrinho', 'carrinhos', {
  id: pk,
  usuario_id: { type: T.INTEGER, allowNull: true, unique: true },
  session_token: { type: T.STRING, allowNull: true, unique: true },
  cupom_id: { type: T.INTEGER, allowNull: true },
  atualizado_em: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
});

const ItemCarrinho = def('ItemCarrinho', 'itens_carrinho', {
  id: pk,
  carrinho_id: { type: T.INTEGER, allowNull: false },
  variacao_sku_id: { type: T.INTEGER, allowNull: false },
  quantidade: { type: T.INTEGER, allowNull: false, defaultValue: 1 },
  incluir_servico_montagem: { type: T.BOOLEAN, allowNull: false, defaultValue: false },
});

// ===== Módulo 4: Pedidos, Pagamentos e Logística =====
const Pedido = def('Pedido', 'pedidos', {
  id: pk,
  numero_pedido: { type: T.STRING, allowNull: false, unique: true },
  usuario_id: { type: T.INTEGER, allowNull: false },
  endereco_entrega_id: { type: T.INTEGER, allowNull: false },
  cupom_id: { type: T.INTEGER, allowNull: true },
  subtotal_produtos: money(false),
  valor_frete: money(false),
  valor_montagem: money(false, 0),
  valor_desconto: money(false, 0),
  valor_total: money(false),
  status_pedido: {
    type: T.ENUM('aguardando_pagamento', 'pago', 'em_separacao', 'em_transito', 'entregue', 'cancelado'),
    allowNull: false,
    defaultValue: 'aguardando_pagamento',
  },
  criado_em: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
});

const ItemPedido = def('ItemPedido', 'itens_pedido', {
  id: pk,
  pedido_id: { type: T.INTEGER, allowNull: false },
  variacao_sku_id: { type: T.INTEGER, allowNull: false },
  quantidade: { type: T.INTEGER, allowNull: false },
  preco_unitario_pago: money(false),
  servico_montagem_contratado: { type: T.BOOLEAN, allowNull: false, defaultValue: false },
  valor_montagem_unitario: money(false, 0),
});

const Pagamento = def('Pagamento', 'pagamentos', {
  id: pk,
  pedido_id: { type: T.INTEGER, allowNull: false },
  metodo: { type: T.ENUM('cartao_credito', 'pix', 'boleto'), allowNull: false },
  parcelas: { type: T.INTEGER, allowNull: false, defaultValue: 1 },
  valor: money(false),
  status_pagamento: { type: T.ENUM('pendente', 'aprovado', 'recusado', 'estornado'), allowNull: false, defaultValue: 'pendente' },
  gateway_transacao_id: { type: T.STRING, allowNull: true, unique: true },
  pago_em: { type: T.DATE, allowNull: true },
});

const Entrega = def('Entrega', 'entregas_rastreamento', {
  id: pk,
  pedido_id: { type: T.INTEGER, allowNull: false, unique: true },
  transportadora_nome: T.STRING,
  codigo_rastreio: T.STRING,
  url_rastreio: T.STRING,
  previsao_entrega: { type: T.DATE, allowNull: false },
  data_entrega_realizada: { type: T.DATE, allowNull: true },
  status_entrega: { type: T.ENUM('separacao', 'coletado', 'em_rota', 'entregue'), allowNull: false, defaultValue: 'separacao' },
});

const AgendamentoMontagem = def('AgendamentoMontagem', 'agendamentos_montagem', {
  id: pk,
  pedido_id: { type: T.INTEGER, allowNull: false, unique: true },
  nome_montador: T.STRING,
  telefone_montador: T.STRING,
  data_agendada: { type: T.DATE, allowNull: true },
  turno: { type: T.ENUM('manha', 'tarde'), allowNull: true },
  status_montagem: { type: T.ENUM('aguardando_entrega', 'agendado', 'concluido'), allowNull: false, defaultValue: 'aguardando_entrega' },
});

// ===== Módulo 5: Avaliações =====
const Avaliacao = def('Avaliacao', 'avaliacoes_produtos', {
  id: pk,
  produto_id: { type: T.INTEGER, allowNull: false },
  usuario_id: { type: T.INTEGER, allowNull: false },
  pedido_id: { type: T.INTEGER, allowNull: false },
  nota_geral: { type: T.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  nota_facilidade_montagem: { type: T.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  comentario: T.TEXT,
  foto_cliente_url: T.STRING,
  aprovado: { type: T.BOOLEAN, allowNull: false, defaultValue: false },
  criado_em: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
});

// ===== Relacionamentos (conforme diagrama) =====
Usuario.hasMany(Endereco, { foreignKey: 'usuario_id', as: 'enderecos', onDelete: 'CASCADE' });
Endereco.belongsTo(Usuario, { foreignKey: 'usuario_id' });
Usuario.hasMany(Pedido, { foreignKey: 'usuario_id', as: 'pedidos', onDelete: 'RESTRICT' });
Pedido.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario', onDelete: 'RESTRICT' });
Usuario.hasOne(Carrinho, { foreignKey: 'usuario_id' });
Carrinho.belongsTo(Usuario, { foreignKey: 'usuario_id' });

Categoria.hasMany(Categoria, { foreignKey: 'categoria_pai_id', as: 'subcategorias', onDelete: 'RESTRICT' });
Categoria.belongsTo(Categoria, { foreignKey: 'categoria_pai_id', as: 'pai', onDelete: 'RESTRICT' });
Categoria.hasMany(Produto, { foreignKey: 'categoria_id', as: 'produtos', onDelete: 'RESTRICT' });
Produto.belongsTo(Categoria, { foreignKey: 'categoria_id', as: 'categoria', onDelete: 'RESTRICT' });
Marca.hasMany(Produto, { foreignKey: 'marca_id', as: 'produtos', onDelete: 'RESTRICT' });
Produto.belongsTo(Marca, { foreignKey: 'marca_id', as: 'marca', onDelete: 'RESTRICT' });

Produto.belongsToMany(Ambiente, { through: ProdutoAmbiente, foreignKey: 'produto_id', otherKey: 'ambiente_id', as: 'ambientes' });
Ambiente.belongsToMany(Produto, { through: ProdutoAmbiente, foreignKey: 'ambiente_id', otherKey: 'produto_id', as: 'produtos' });

Produto.hasMany(VariacaoSku, { foreignKey: 'produto_id', as: 'variacoes', onDelete: 'CASCADE' });
VariacaoSku.belongsTo(Produto, { foreignKey: 'produto_id', as: 'produto' });
Produto.hasMany(ImagemProduto, { foreignKey: 'produto_id', as: 'imagens', onDelete: 'CASCADE' });
ImagemProduto.belongsTo(Produto, { foreignKey: 'produto_id' });
VariacaoSku.hasMany(ImagemProduto, { foreignKey: 'variacao_sku_id', as: 'imagens' });
ImagemProduto.belongsTo(VariacaoSku, { foreignKey: 'variacao_sku_id' });

Carrinho.hasMany(ItemCarrinho, { foreignKey: 'carrinho_id', as: 'itens', onDelete: 'CASCADE' });
ItemCarrinho.belongsTo(Carrinho, { foreignKey: 'carrinho_id' });
ItemCarrinho.belongsTo(VariacaoSku, { foreignKey: 'variacao_sku_id', as: 'variacao', onDelete: 'RESTRICT' });
VariacaoSku.hasMany(ItemCarrinho, { foreignKey: 'variacao_sku_id', onDelete: 'RESTRICT' });
Cupom.hasMany(Carrinho, { foreignKey: 'cupom_id', onDelete: 'SET NULL' });
Carrinho.belongsTo(Cupom, { foreignKey: 'cupom_id', as: 'cupom' });
Cupom.hasMany(Pedido, { foreignKey: 'cupom_id', onDelete: 'RESTRICT' });
Pedido.belongsTo(Cupom, { foreignKey: 'cupom_id', as: 'cupom' });

Pedido.belongsTo(Endereco, { foreignKey: 'endereco_entrega_id', as: 'endereco', onDelete: 'RESTRICT' });
Pedido.hasMany(ItemPedido, { foreignKey: 'pedido_id', as: 'itens', onDelete: 'CASCADE' });
ItemPedido.belongsTo(Pedido, { foreignKey: 'pedido_id' });
ItemPedido.belongsTo(VariacaoSku, { foreignKey: 'variacao_sku_id', as: 'variacao', onDelete: 'RESTRICT' });
VariacaoSku.hasMany(ItemPedido, { foreignKey: 'variacao_sku_id', onDelete: 'RESTRICT' });
Pedido.hasMany(Pagamento, { foreignKey: 'pedido_id', as: 'pagamentos', onDelete: 'CASCADE' });
Pagamento.belongsTo(Pedido, { foreignKey: 'pedido_id' });
Pedido.hasOne(Entrega, { foreignKey: 'pedido_id', as: 'entrega', onDelete: 'CASCADE' });
Entrega.belongsTo(Pedido, { foreignKey: 'pedido_id', as: 'pedido' });
Pedido.hasOne(AgendamentoMontagem, { foreignKey: 'pedido_id', as: 'montagem', onDelete: 'CASCADE' });
AgendamentoMontagem.belongsTo(Pedido, { foreignKey: 'pedido_id', as: 'pedido' });

Pedido.hasMany(Avaliacao, { foreignKey: 'pedido_id', onDelete: 'RESTRICT' });
Avaliacao.belongsTo(Pedido, { foreignKey: 'pedido_id', onDelete: 'RESTRICT' });
Produto.hasMany(Avaliacao, { foreignKey: 'produto_id', as: 'avaliacoes' });
Avaliacao.belongsTo(Produto, { foreignKey: 'produto_id', as: 'produto' });
Usuario.hasMany(Avaliacao, { foreignKey: 'usuario_id', onDelete: 'RESTRICT' });
Avaliacao.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario', onDelete: 'RESTRICT' });

module.exports = {
  sequelize, Usuario, Endereco, Categoria, Ambiente, Marca, Produto, ProdutoAmbiente, VariacaoSku, ImagemProduto,
  Cupom, Carrinho, ItemCarrinho, Pedido, ItemPedido, Pagamento, Entrega, AgendamentoMontagem, Avaliacao,
};
