const express = require('express');
const router = express.Router();
const categoriasController = require('../controllers/categoriasController');

router.get('/', categoriasController.listarCategorias);
router.post('/', categoriasController.criarCategoria);
router.delete('/:id', categoriasController.excluirCategoria);

module.exports = router;