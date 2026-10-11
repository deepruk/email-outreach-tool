import uuid


def test_inbox_delete_allows_unused_and_blocks_referenced(auth_client):
    suffix = uuid.uuid4().hex[:10]
    unused = auth_client.post('/workspace/inboxes/connect', json={'email': f'tscheck-inbox-{suffix}@example.com', 'display_name': 'tscheck inbox'}).json()
    response = auth_client.delete(f"/workspace/inboxes/{unused['id']}")
    assert response.status_code == 204, response.text
    assert auth_client.get('/workspace/inboxes').json() and all(row['id'] != unused['id'] for row in auth_client.get('/workspace/inboxes').json())

    inbox = auth_client.post('/workspace/inboxes/connect', json={'email': f'tscheck-inbox-ref-{suffix}@example.com', 'display_name': 'tscheck referenced inbox'}).json()
    recipient = auth_client.post('/workspace/recipients', json={'name': f'tscheck recipient {suffix}', 'email': f'tscheck-recipient-{suffix}@example.com', 'company': 'tscheck'}).json()
    template = auth_client.post('/workspace/templates', json={'name': f'tscheck template {suffix}', 'subject': 'tscheck', 'body': 'tscheck'}).json()
    campaign = auth_client.post('/workspace/campaigns', json={'name': f'tscheck campaign {suffix}', 'inbox_id': inbox['id'], 'template_id': template['id'], 'recipient_ids': [recipient['id']], 'min_gap_minutes': 10, 'max_gap_minutes': 20})
    assert campaign.status_code == 200, campaign.text
    blocked = auth_client.delete(f"/workspace/inboxes/{inbox['id']}")
    assert blocked.status_code == 409
    assert 'used by an existing campaign' in blocked.json()['detail']
