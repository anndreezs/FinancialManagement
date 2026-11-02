const express = require('express');
const router = express.Router();
const contasController = require('../controllers/contasController');

router.get('/', contasController.listarContas);
router.post('/', contasController.criarConta);
router.put('/:id', contasController.atualizarConta);
router.delete('/:id', contasController.excluirConta);


module.exports = router;