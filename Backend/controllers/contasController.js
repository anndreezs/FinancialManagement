const db = require('../config/db').promise();

/* ================= LISTAR ================= */
exports.listarContas = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [results] = await db.query('SELECT * FROM contas WHERE usuario_id = ? ORDER BY nome', [usuarioId]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar contas' });
  }
};

/* ================= CRIAR ================= */
exports.criarConta = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { nome, tipo, saldo } = req.body;

  if (!nome || !tipo) {
    return res.status(400).json({ error: 'Nome e tipo da conta são obrigatórios' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO contas (nome, tipo, saldo, usuario_id) VALUES (?, ?, ?, ?)',
      [String(nome).trim(), tipo, Number(saldo || 0), usuarioId]
    );
    res.status(201).json({ id: result.insertId, nome, tipo, saldo: Number(saldo || 0), usuario_id: usuarioId });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
};

/* ================= ATUALIZAR ================= */
exports.atualizarConta = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { id } = req.params;
  const { nome, tipo, saldo } = req.body;

  try {
    const [updateResult] = await db.query(
      'UPDATE contas SET nome = ?, tipo = ?, saldo = ? WHERE id = ? AND usuario_id = ?',
      [String(nome).trim(), tipo, Number(saldo || 0), id, usuarioId]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    const [results] = await db.query('SELECT * FROM contas WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar conta' });
  }
};

/* ================= EXCLUIR ================= */
exports.excluirConta = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { id } = req.params;

  try {
    const [result] = await db.query('DELETE FROM contas WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Não é possível excluir conta com movimentações atreladas' });
  }
};
