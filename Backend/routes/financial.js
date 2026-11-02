const express = require('express');
const controller = require('../controllers/financialController');

const router = express.Router();

router.get('/settings', controller.getSettings);
router.put('/settings', controller.updateSettings);
router.get('/planning', controller.getPlanning);
router.post('/planning/reset', controller.resetPlanning);
router.get('/reports/monthly', controller.getMonthlyReport);
router.get('/reports/trend', controller.getTrendReport);

// Lançamentos Previstos
router.get('/planned-movements', controller.listPlannedMovements);
router.post('/planned-movements', controller.createPlannedMovement);
router.delete('/planned-movements', controller.clearPlannedMovements);
router.delete('/planned-movements/:id', controller.deletePlannedMovement);
router.patch('/planned-movements/:id/settle', controller.settlePlannedMovement);
router.patch('/planned-movements/:id/cancel', controller.cancelPlannedMovement);

// Transferências Internas
router.get('/transfers', controller.listInternalTransfers);
router.post('/transfers', controller.createInternalTransfer);

// Central de Alertas e Notificações
router.get('/alerts', controller.listAlerts);
router.patch('/alerts/:id/read', controller.markAlertRead);
router.patch('/alerts/:id/dismiss', controller.dismissAlert);
router.post('/alerts/read-all', controller.markAllAlertsRead);

module.exports = router;
