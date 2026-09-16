<!-- Repository note: Explains optional scheduled monitoring and email-report operation. -->
# Scheduled crawl reports on Ubuntu / WSL

The monitor is a one-shot command. Installing this project does not register a cron job, deploy a server, or send email. Use a site you are authorized to crawl.

## One manual run, no email

```bash
cd ~/web-crawler
npm run build
python3 scripts/monitor.py https://example.com/ --max-pages 100 --out reports/example
```

Overlapping monitor runs using the same output prefix are prevented by a file lock. Fresh reports are generated in a temporary directory before replacing output files, so an early process failure cannot accidentally email a stale report.

## Add SMTP explicitly

```bash
mkdir -p ~/.config
install -m 600 .env.example ~/.config/web-crawler.env
nano ~/.config/web-crawler.env
```

Supply your provider's SMTP hostname, port, username/app password, sender and explicit recipient. For port 587 use `SMTP_SECURITY=starttls`; for implicit TLS on port 465 use `SMTP_SECURITY=ssl`. Certificate validation remains enabled. The parser treats the file as KEY=value data; it does not execute shell expressions or expand environment references. Do not commit or paste real credentials.

Test a run yourself:

```bash
python3 scripts/monitor.py https://example.com/ \
  --out reports/example --max-pages 100 \
  --email --env-file ~/.config/web-crawler.env
```

This command really sends to SMTP_TO. Change-only delivery adds `--only-changes`; the first run sends, then subsequent unchanged reports do not. Timing differences are excluded from comparison. HTML attachments above 10 MiB are omitted. SMTP authentication and delivery depend on your provider; no live account was tested during preparation of this upgrade.

## Optional daily cron job

Determine executable paths while the intended Node version is active:

```bash
command -v node
command -v python3
crontab -e
```

For example, to run daily at 07:00 in the machine's configured timezone, adapt the Node directory in PATH to the result of `command -v node`:

```cron
PATH=/home/alex/.nvm/versions/node/REPLACE_WITH_YOUR_VERSION/bin:/usr/local/bin:/usr/bin:/bin
0 7 * * * cd /home/alex/web-crawler && /usr/bin/python3 scripts/monitor.py https://example.com/ --out reports/example --email --only-changes --env-file /home/alex/.config/web-crawler.env >> /home/alex/web-crawler/reports/monitor.log 2>&1
```

Create `reports/` first. The version placeholder is intentionally not a guessed path. Cron does not source your interactive nvm setup. Ensure the cron service is running. WSL cannot be relied on for unattended work while the Windows host/WSL instance is shut down or asleep; use an always-on Linux host for reliable scheduling. A sleeping host does not become a server because a timer was configured.

To stop scheduling, remove the line with `crontab -e`. The monitor never modifies crontab automatically. Rotate logs and retain/delete reports according to the sensitivity of the crawled site.
