const express = require('express');
const controller = require('../controllers/goalsController');

const router = express.Router();

router.get('/', controller.listGoals);
router.post('/', controller.createGoal);
router.delete('/', controller.clearAllGoals);
router.put('/:goalId', controller.updateGoal);
router.delete('/:goalId', controller.deleteGoal);
router.post('/:goalId/reset', controller.resetGoal);
router.patch('/:goalId/status', controller.updateGoalStatus);

// Movimentações da Meta
router.get('/:goalId/movements', controller.listGoalMovements);
router.post('/:goalId/movements', controller.createGoalMovement);
router.post('/:goalId/movements/:movementId/reverse', controller.reverseGoalMovement);

// Planejamento de Contribuições
router.get('/:goalId/plans', controller.listPlans);
router.post('/:goalId/plans', controller.createPlan);
router.delete('/:goalId/plans', controller.deleteGoalPlan);
router.put('/:goalId/plans/:planId/replan', controller.replan);
router.patch('/:goalId/plans/:planId/status', controller.updatePlanStatus);
router.post('/:goalId/occurrences/:occurrenceId/contribute', controller.createGoalMovement);
router.post('/:goalId/occurrences/:occurrenceId/defer', controller.deferOccurrence);
router.post('/:goalId/occurrences/:occurrenceId/skip', controller.skipOccurrence);

module.exports = router;
