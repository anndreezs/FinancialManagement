const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configura CORS flexível para suportar Frontend Web (localhost), PC e requisições do Celular via Expo Go
app.use(cors({
  origin: (origin, callback) => {
    // Permite chamadas sem origin (aplicativos móveis como Expo Go, React Native, Postman, curl)
    if (!origin) return callback(null, true);

    // Permite localhost, 127.0.0.1 e redes locais (192.168.x.x, 10.x.x.x)
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.startsWith('http://192.168.') ||
      origin.startsWith('http://10.') ||
      origin.startsWith('exp://')
    ) {
      return callback(null, true);
    }

    // Fallback permissivo para ambiente de desenvolvimento pessoal
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}));

// parse JSON
app.use(express.json());

// Health check para Render / Monitoramento
app.get('/health', (_req, res) => res.json({ status: 'ok', database: 'ready', time: new Date().toISOString() }));

const authMiddleware = require('./middlewares/authMiddleware');

// rotas
const authRoutes = require('./routes/auth');
const contasRoutes = require('./routes/contas');
const cartoesRoutes = require('./routes/cartoes');
const transacoesRoutes = require('./routes/transacoes');
const relatoriosRoutes = require('./routes/relatorios');
const categoriasRoutes = require('./routes/categorias');
const dividasRoutes = require('./routes/dividas');
const financialRoutes = require('./routes/financial');
const goalsRoutes = require('./routes/goals');

app.use('/auth', authRoutes);
app.use('/contas', authMiddleware, contasRoutes);
app.use('/cartoes', authMiddleware, cartoesRoutes);
app.use('/transacoes', authMiddleware, transacoesRoutes);
app.use('/relatorios', authMiddleware, relatoriosRoutes);
app.use('/categorias', authMiddleware, categoriasRoutes);
app.use('/dividas', authMiddleware, dividasRoutes);
app.use('/financeiro', authMiddleware, financialRoutes);
app.use('/metas', authMiddleware, goalsRoutes);

const PORT = process.env.PORT || 3000;
// Escuta em 0.0.0.0 para ser acessível tanto no localhost do PC quanto pelo celular na rede local (Expo Go)
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando na porta ${PORT} (acessível no PC e via Expo Go na rede local)`));
