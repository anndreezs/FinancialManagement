const express = require('express');
const router = express.Router();
const cartoesController = require('../controllers/cartoesController');

router.get('/', cartoesController.listarCartoes);
router.post('/', cartoesController.criarCartao);
router.put('/:id', cartoesController.atualizarCartao);
router.delete('/:id', cartoesController.excluirCartao);
router.patch('/:id/pagar', cartoesController.pagarCartao);
router.get('/:id/pagamentos', cartoesController.listarPagamentos);

module.exports = router;