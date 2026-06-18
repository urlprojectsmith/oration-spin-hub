import express from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { reselectSpeaker, spinCoordinator, spinCustomWheel, spinSpeaker } from '../services/spinService.js';
import { sendSelectionNotifications } from '../services/notificationService.js';
import { auditLog } from '../services/auditService.js';
import { emitWebhookEvent } from '../services/webhookService.js';

const router = express.Router();
router.use(authenticate, allowRoles('super_admin', 'admin'));

router.post('/speaker', asyncHandler(async (req, res) => {
  const result = await spinSpeaker({
    selectedBy: req.user.id,
    eventDate: req.body.event_date,
    notes: req.body.notes,
    notify: req.body.notify
  });

  let notifications = [];
  if (req.body.notify) {
    notifications = await sendSelectionNotifications({
      employee: result.winner,
      eventDate: req.body.event_date || new Date(),
      eventType: 'speaker',
      selectedBy: req.user.id
    });
  }

  await auditLog({ userId: req.user.id, action: 'spin_speaker', entityType: 'spin_result', entityId: result.result.id, metadata: { winner: result.winner.employee_name }, ip: req.ip });
  await emitWebhookEvent('spin.speaker.selected', {
    winner: result.winner,
    cycle: result.cycle,
    result: result.result,
    selectedBy: req.user
  });
  res.json({ ...result, notifications });
}));

router.post('/speaker/reselect', asyncHandler(async (req, res) => {
  const result = await reselectSpeaker({
    selectedBy: req.user.id,
    previousResultId: req.body.previous_result_id,
    eventDate: req.body.event_date,
    notes: req.body.notes,
    notify: req.body.notify
  });

  let notifications = [];
  if (req.body.notify) {
    notifications = await sendSelectionNotifications({
      employee: result.winner,
      eventDate: req.body.event_date || new Date(),
      eventType: 'speaker_reselect',
      selectedBy: req.user.id
    });
  }

  await auditLog({
    userId: req.user.id,
    action: 'reselect_speaker',
    entityType: 'spin_result',
    entityId: result.result.id,
    metadata: { winner: result.winner.employee_name, previous_result_id: req.body.previous_result_id },
    ip: req.ip
  });
  await emitWebhookEvent('spin.speaker.reselected', {
    winner: result.winner,
    cycle: result.cycle,
    result: result.result,
    previousResultId: req.body.previous_result_id,
    selectedBy: req.user
  });
  res.json({ ...result, notifications });
}));

router.post('/coordinator', asyncHandler(async (req, res) => {
  const result = await spinCoordinator({
    selectedBy: req.user.id,
    count: req.body.count,
    notes: req.body.notes
  });
  await auditLog({ userId: req.user.id, action: 'spin_coordinator', entityType: 'spin_result', metadata: { winners: result.winners.map((item) => item.employee_name) }, ip: req.ip });
  await emitWebhookEvent('spin.coordinator.selected', {
    winners: result.winners,
    batchId: result.batchId,
    selectedBy: req.user
  });
  res.json(result);
}));

router.post('/custom/:wheelId', asyncHandler(async (req, res) => {
  const result = await spinCustomWheel({
    wheelId: req.params.wheelId,
    selectedBy: req.user.id,
    notes: req.body.notes
  });
  await auditLog({ userId: req.user.id, action: 'spin_custom_wheel', entityType: 'wheel', entityId: req.params.wheelId, metadata: { winner: result.winner.label }, ip: req.ip });
  await emitWebhookEvent('spin.custom.selected', {
    wheel: result.wheel,
    winner: result.winner,
    result: result.result,
    selectedBy: req.user
  });
  res.json(result);
}));

export default router;
