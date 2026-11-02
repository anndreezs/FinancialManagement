const db = require('../config/db').promise();

// Listar categorias do usuário
exports.listarCategorias = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [results] = await db.query('SELECT * FROM categorias WHERE usuario_id = ? ORDER BY nome', [usuarioId]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
};

// Criar categoria
exports.criarCategoria = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { nome, tipo, cor } = req.body;

  if (!nome || !['RECEITA', 'DESPESA'].includes(tipo)) {
    return res.status(400).json({ error: 'Nome e tipo válidos (RECEITA/DESPESA) são obrigatórios' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO categorias (nome, tipo, cor, usuario_id) VALUES (?, ?, ?, ?)',
      [String(nome).trim(), tipo, cor || '#6366f1', usuarioId]
    );
    res.status(201).json({ id: result.insertId, nome, tipo, cor, usuario_id: usuarioId });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
};

// Excluir Categoria
exports.excluirCategoria = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { id } = req.params;

  try {
    const [result] = await db.query('DELETE FROM categorias WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Não é possível excluir categoria em uso por lançamentos' });
  }
};
