import uuid


def test_campaign_delete_allows_non_active_and_blocks_active(auth_client):
    suffix = uuid.uuid4().hex[:10]
    inbox = auth_client.post('/workspace/inboxes/connect', json={'email': f'tscheck-campaign-{suffix}@example.com', 'display_name': 'tscheck'}).json()
    recipient = auth_client.post('/workspace/recipients', json={'name': f'tscheck recipient {suffix}', 'email': f'tscheck-campaign-rec-{suffix}@example.com'}).json()
    template = auth_client.post('/workspace/templates', json={'name': f'tscheck template {suffix}', 'subject': 'tscheck', 'body': 'tscheck'}).json()
    payload = {'name': f'tscheck campaign {suffix}', 'inbox_id': inbox['id'], 'template_id': template['id'], 'recipient_ids': [recipient['id']], 'min_gap_minutes': 10, 'max_gap_minutes': 20}
    queued = auth_client.post('/workspace/campaigns', json=payload).json()
    deleted = auth_client.delete(f"/workspace/campaigns/{queued['id']}")
    assert deleted.status_code == 204, deleted.text
    assert all(row['id'] != queued['id'] for row in auth_client.get('/workspace/campaigns').json())

    active = auth_client.post('/workspace/campaigns', json={**payload, 'name': f'tscheck active campaign {suffix}'}).json()
    launched = auth_client.post(f"/workspace/campaigns/{active['id']}/launch")
    assert launched.status_code == 200, launched.text
    blocked = auth_client.delete(f"/workspace/campaigns/{active['id']}")
    assert blocked.status_code == 409
    assert 'Pause the campaign before deleting it' in blocked.json()['detail']
