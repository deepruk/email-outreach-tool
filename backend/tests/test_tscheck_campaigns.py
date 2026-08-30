import uuid


def test_campaign_delete_allows_non_active_and_blocks_active(client):
    suffix = uuid.uuid4().hex[:10]
    inbox = client.post('/workspace/inboxes/connect', json={'email': f'tscheck-campaign-{suffix}@example.com', 'display_name': 'tscheck'}).json()
    recipient = client.post('/workspace/recipients', json={'name': f'tscheck recipient {suffix}', 'email': f'tscheck-campaign-rec-{suffix}@example.com'}).json()
    template = client.post('/workspace/templates', json={'name': f'tscheck template {suffix}', 'subject': 'tscheck', 'body': 'tscheck'}).json()
    payload = {'name': f'tscheck campaign {suffix}', 'inbox_id': inbox['id'], 'template_id': template['id'], 'recipient_ids': [recipient['id']], 'min_gap_minutes': 10, 'max_gap_minutes': 20}
    queued = client.post('/workspace/campaigns', json=payload).json()
    deleted = client.delete(f"/workspace/campaigns/{queued['id']}")
    assert deleted.status_code == 204, deleted.text
    assert all(row['id'] != queued['id'] for row in client.get('/workspace/campaigns').json())

    active = client.post('/workspace/campaigns', json={**payload, 'name': f'tscheck active campaign {suffix}'}).json()
    launched = client.post(f"/workspace/campaigns/{active['id']}/launch")
    assert launched.status_code == 200, launched.text
    blocked = client.delete(f"/workspace/campaigns/{active['id']}")
    assert blocked.status_code == 409
    assert 'Pause the campaign before deleting it' in blocked.json()['detail']
