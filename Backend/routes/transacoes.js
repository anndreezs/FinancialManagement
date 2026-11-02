const express = require('express');
const router = express.Router();
const transacoesController = require('../controllers/transacoesController');

router.get('/', transacoesController.listarTransacoes);
router.post('/', transacoesController.criarTransacao);
router.delete('/:id', transacoesController.deletarTransacao);

module.exports = router;