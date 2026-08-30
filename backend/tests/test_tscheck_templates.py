import uuid


def test_template_delete_allows_unused_and_blocks_referenced(client):
    suffix = uuid.uuid4().hex[:10]
    unused = client.post('/workspace/templates', json={'name': f'tscheck template {suffix}', 'subject': 'tscheck', 'body': 'tscheck'}).json()
    response = client.delete(f"/workspace/templates/{unused['id']}")
    assert response.status_code == 204, response.text
    assert all(row['id'] != unused['id'] for row in client.get('/workspace/templates').json())

    template = client.post('/workspace/templates', json={'name': f'tscheck template ref {suffix}', 'subject': 'tscheck', 'body': 'tscheck'}).json()
    inbox = client.post('/workspace/inboxes/connect', json={'email': f'tscheck-template-{suffix}@example.com', 'display_name': 'tscheck'}).json()
    recipient = client.post('/workspace/recipients', json={'name': f'tscheck recipient {suffix}', 'email': f'tscheck-template-rec-{suffix}@example.com'}).json()
    campaign = client.post('/workspace/campaigns', json={'name': f'tscheck campaign {suffix}', 'inbox_id': inbox['id'], 'template_id': template['id'], 'recipient_ids': [recipient['id']], 'min_gap_minutes': 10, 'max_gap_minutes': 20})
    assert campaign.status_code == 200, campaign.text
    blocked = client.delete(f"/workspace/templates/{template['id']}")
    assert blocked.status_code == 409
    assert 'used by an existing campaign' in blocked.json()['detail']
