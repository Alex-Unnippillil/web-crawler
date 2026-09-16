#!/usr/bin/env python3
# Repository note: Optional POSIX monitoring helper for scheduled crawls and email notifications.
# Optional scheduled monitoring helper that runs crawls and can email a concise change report.

"""One Linux/WSL monitoring iteration. Scheduling is configured separately.
No shell evaluation, no implicit email sending, and no plaintext SMTP transport.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import smtplib
import ssl
import subprocess
import sys
import tempfile
from email.message import EmailMessage

ROOT = Path(__file__).resolve().parents[1]

def load_config(path: str | None) -> dict[str, str]:
    config: dict[str, str] = {}
    if path:
        source = Path(path).expanduser()
        if source.stat().st_mode & 0o077:
            raise ValueError('Credential file must not be group/world-accessible. Run chmod 600 on it.')
        for line in source.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' not in line:
                raise ValueError('Credential lines must use KEY=value syntax.')
            key, value = line.split('=', 1)
            config[key.strip()] = value.strip().strip('"').strip("'")
    return {**config, **os.environ}

def fingerprint(pages: list[dict], metadata: dict) -> str:
    stable = [{key: value for key, value in page.items() if key not in {'duration_ms', 'depth', 'requested_url'}} for page in pages]
    errors = sorted(metadata.get('errors', []), key=lambda item: json.dumps(item, sort_keys=True))
    payload = {'pages': stable, 'errors': errors, 'stopped': metadata.get('summary', {}).get('stopped')}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def send_email(config: dict[str, str], subject: str, text: str, attachment: Path | None) -> None:
    for name in ('SMTP_HOST', 'SMTP_FROM', 'SMTP_TO'):
        if not config.get(name):
            raise ValueError(f'{name} is required when --email is enabled.')
    recipients = [value.strip() for value in config['SMTP_TO'].split(',') if value.strip()]
    if not recipients:
        raise ValueError('At least one SMTP_TO recipient is required.')
    message = EmailMessage()
    message['Subject'] = subject
    message['From'] = config['SMTP_FROM']
    message['To'] = ', '.join(recipients)
    message.set_content(text)
    if attachment:
        if attachment.stat().st_size > 10 * 1024 * 1024:
            message.set_content(text + '\nHTML attachment omitted because it exceeds 10 MiB.\n')
        else:
            message.add_attachment(attachment.read_bytes(), maintype='text', subtype='html', filename=attachment.name)
    mode = config.get('SMTP_SECURITY', 'starttls').lower()
    if mode not in {'ssl', 'starttls'}:
        raise ValueError('SMTP_SECURITY must be ssl or starttls; insecure SMTP is disabled.')
    port = int(config.get('SMTP_PORT', '465' if mode == 'ssl' else '587'))
    context = ssl.create_default_context()
    if mode == 'ssl':
        connection = smtplib.SMTP_SSL(config['SMTP_HOST'], port, timeout=30, context=context)
    else:
        connection = smtplib.SMTP(config['SMTP_HOST'], port, timeout=30)
    with connection as smtp:
        smtp.ehlo()
        if mode == 'starttls':
            smtp.starttls(context=context)
            smtp.ehlo()
        if config.get('SMTP_USER'):
            if not config.get('SMTP_PASSWORD'):
                raise ValueError('SMTP_PASSWORD is required with SMTP_USER.')
            smtp.login(config['SMTP_USER'], config['SMTP_PASSWORD'])
        smtp.send_message(message, to_addrs=recipients)

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('--out', default='reports/monitor')
    parser.add_argument('--concurrency', type=int, default=2)
    parser.add_argument('--max-pages', type=int, default=100)
    parser.add_argument('--email', action='store_true')
    parser.add_argument('--only-changes', action='store_true')
    parser.add_argument('--env-file')
    args = parser.parse_args()
    if not (ROOT / 'dist/index.js').is_file():
        raise ValueError('Build first: npm run build')
    prefix = Path(args.out).expanduser().resolve()
    if prefix.suffix.lower() == '.json':
        prefix = prefix.with_suffix('')
    prefix.parent.mkdir(parents=True, exist_ok=True)
    os.umask(0o077)
    lock_path = Path(str(prefix) + '.lock')
    with lock_path.open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Another monitoring run is active; skipping.')
            return 0
        config = load_config(args.env_file) if args.email else {}
        with tempfile.TemporaryDirectory(prefix='web-crawler-monitor-') as work:
            temporary = Path(work) / 'site.json'
            completed = subprocess.run([
                'node', str(ROOT / 'dist/index.js'), args.url,
                '--concurrency', str(args.concurrency), '--max-pages', str(args.max_pages),
                '--out', str(temporary), '--quiet',
            ], cwd=ROOT, check=False)
            metadata_path = Path(work) / 'site.summary.json'
            if not temporary.is_file() or not metadata_path.is_file():
                if args.email:
                    send_email(config, 'Crawler failed before producing a report',
                               f'No fresh report was generated for {args.url}. Exit status: {completed.returncode}. Inspect server logs.', None)
                return 1
            pages = json.loads(temporary.read_text())
            metadata = json.loads(metadata_path.read_text())
            digest = fingerprint(pages, metadata)
            state = Path(str(prefix) + ('.email.state' if args.email else '.state'))
            previous = state.read_text().strip() if state.is_file() else ''
            for extension in ('.json', '.summary.json', '.csv', '.html', '.svg'):
                source = Path(work) / ('site' + extension)
                destination = Path(str(prefix) + extension)
                staged = Path(str(destination) + '.tmp')
                shutil.copyfile(source, staged)
                staged.chmod(0o600)
                os.replace(staged, destination)
            summary = metadata['summary']
            unhealthy = completed.returncode != 0 or summary['failed'] > 0
            if args.email and (not args.only_changes or previous != digest):
                subject = f"Crawler {'ATTENTION' if unhealthy else 'report'}: {summary['pages_crawled']} pages"
                text = (f"URL: {args.url}\nSuccessful pages: {summary['pages_crawled']}\n"
                        f"Failed/non-HTML candidates: {summary['failed']}\n"
                        f"External URLs found: {summary['unique_external_links']}\n"
                        f"Candidate budget reached: {summary['limit_reached']}\n"
                        f"Stopped early: {summary['stopped']}\n")
                send_email(config, subject, text, Path(str(prefix) + '.html'))
            # Do not advance change-detection state when an attempted email fails.
            staged_state = Path(str(state) + '.tmp')
            staged_state.write_text(digest + '\n', encoding='utf-8')
            os.replace(staged_state, state)
            print(f"Monitoring complete: {prefix}.html; changed={previous != digest}")
            return 1 if unhealthy else 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, smtplib.SMTPException, subprocess.SubprocessError) as error:
        print(f'Monitor error: {error}', file=sys.stderr)
        raise SystemExit(1)
