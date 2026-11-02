/**
 * Serviço de Notificações e Alertas
 * Suporta persistência de alertas no banco e disparo opcional por e-mail (SMTP).
 */

const { pool } = require('./financialStore');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {
  // nodemailer opcional se o usuário não quiser instalar agora
}

function getMailerTransporter() {
  const isEnabled = process.env.SMTP_ENABLED === 'true';
  if (!isEnabled || !nodemailer) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });
}

/**
 * Envia um e-mail de alerta caso o SMTP esteja configurado.
 */
async function sendAlertEmail({ to, subject, message, alertType }) {
  const isEnabled = process.env.SMTP_ENABLED === 'true';

  if (!isEnabled) {
    console.log(`[NOTIFICAÇÃO/E-MAIL SIMULADO] Para: ${to} | Assunto: ${subject} | Mensagem: ${message}`);
    return { sent: false, simulated: true };
  }

  const transporter = getMailerTransporter();
  if (!transporter) {
    console.warn('[NOTIFICAÇÃO] SMTP habilitado mas transporter não disponível (instale nodemailer: npm i nodemailer)');
    return { sent: false, error: 'Transporter indisponível' };
  }

  try {
    const from = process.env.SMTP_FROM || 'Gestão Financeira <alerta@financeiro.local>';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Alerta Financeiro</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">${message}</p>
        <div style="margin-top: 20px; padding: 12px; background-color: #f8fafc; border-left: 4px solid #3b82f6; font-size: 13px; color: #64748b;">
          Tipo de Notificação: <strong>${alertType || 'card_limit'}</strong><br />
          Data/Hora: ${new Date().toLocaleString('pt-BR')}
        </div>
        <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; text-align: center;">
          Este é um alerta automático gerado pelo seu sistema de Gestão Financeira.
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: message,
      html,
    });

    console.log(`[NOTIFICAÇÃO] E-mail de alerta enviado com sucesso para ${to}. ID: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('[NOTIFICAÇÃO] Falha ao enviar e-mail de alerta:', error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Cria o evento de alerta e aciona a notificação por e-mail em background se configurado.
 */
async function registerAlertEvent(connection, { usuarioId = 1, alertKey, tipo, entidadeId, mensagem }) {
  await connection.query(
    `INSERT INTO financial_alert_events (usuario_id, alert_key, tipo, entidade_id, mensagem)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mensagem = VALUES(mensagem)`,
    [usuarioId, alertKey, tipo, entidadeId, mensagem]
  );

  // Busca e-mail do usuário de forma assíncrona para notificar sem bloquear a transação principal
  setImmediate(async () => {
    try {
      const [users] = await pool.query('SELECT email, nome FROM usuarios WHERE id = ?', [usuarioId]);
      if (users && users[0]?.email) {
        await sendAlertEmail({
          to: users[0].email,
          subject: `⚠️ Alerta Financeiro: ${mensagem}`,
          message: `Olá, ${users[0].nome}. ${mensagem}`,
          alertType: tipo,
        });
      }
    } catch (err) {
      // Ignora erro assíncrono para não afetar o fluxo do usuário
    }
  });
}

module.exports = {
  sendAlertEmail,
  registerAlertEvent,
};
