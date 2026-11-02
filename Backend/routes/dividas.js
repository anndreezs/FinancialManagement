const express = require('express');
const router = express.Router();
const dividasController = require('../controllers/dividasController');

router.get('/', dividasController.listarDividas);
router.post('/', dividasController.criarDivida);
router.patch('/:id/pagar', dividasController.pagarDivida);
router.delete('/:id', dividasController.deletarDivida);


module.exports = router;
