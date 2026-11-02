const express = require('express');
const router = express.Router();
const relatoriosController = require('../controllers/relatoriosController');

const {relatorioMensal} = require('../controllers/relatoriosController');

router.get('/mensal', relatorioMensal);
router.get('/saldo-geral', relatoriosController.saldoGeral);
router.get('/saldo-contas', relatoriosController.saldoContas);
router.get('/saldo-cartoes', relatoriosController.saldoCartoes);

module.exports = router;