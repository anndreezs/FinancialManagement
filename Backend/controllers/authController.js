const { pool } = require('../services/financialStore');
const { hashPassword, comparePassword, generateToken } = require('../config/auth');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.register = async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    const nomeFormatado = String(nome || '').trim();
    const emailFormatado = String(email || '').trim().toLowerCase();
    const senhaStr = String(senha || '');

    if (!nomeFormatado || nomeFormatado.length < 2) {
      return res.status(400).json({ error: 'O nome deve ter no mínimo 2 caracteres' });
    }

    if (!emailFormatado || !emailRegex.test(emailFormatado)) {
      return res.status(400).json({ error: 'Informe um e-mail válido' });
    }

    if (!senhaStr || senhaStr.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    // Verifica duplicidade
    const [existing] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [emailFormatado]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Este e-mail já está em uso' });
    }

    const hashedPassword = await hashPassword(senhaStr);

    const [result] = await pool.query(
      'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
      [nomeFormatado, emailFormatado, hashedPassword]
    );

    const user = {
      id: result.insertId,
      nome: nomeFormatado,
      email: emailFormatado,
    };

    const token = generateToken(user);

    return res.status(201).json({
      message: 'Usuário cadastrado com sucesso',
      user,
      token,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Este e-mail já está em uso' });
    }
    console.error('Erro no cadastro:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar cadastro' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, senha } = req.body;

    const emailFormatado = String(email || '').trim().toLowerCase();
    const senhaStr = String(senha || '');

    if (!emailFormatado || !senhaStr) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    const [rows] = await pool.query(
      'SELECT id, nome, email, senha FROM usuarios WHERE email = ?',
      [emailFormatado]
    );

    const userDb = rows[0];
    if (!userDb) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    const senhaValida = await comparePassword(senhaStr, userDb.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    const user = {
      id: userDb.id,
      nome: userDb.nome,
      email: userDb.email,
    };

    const token = generateToken(user);

    return res.json({
      message: 'Login realizado com sucesso',
      user,
      token,
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar login' });
  }
};

exports.me = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const [rows] = await pool.query(
      'SELECT id, nome, email, created_at FROM usuarios WHERE id = ?',
      [userId]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('Erro ao buscar dados do usuário:', error);
    return res.status(500).json({ error: 'Erro ao consultar dados do usuário' });
  }
};
