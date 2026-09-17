"""Shared user-facing actions for real-browser acceptance tests."""
from playwright.sync_api import expect


def start_sample(page, action):
    page.locator('[data-action="examples"]').filter(visible=True).first.click()
    expect(page.get_by_role('dialog', name='Try a sample crawl')).to_be_visible()
    page.locator(f'#examples-dialog [data-action="{action}"]').click()
