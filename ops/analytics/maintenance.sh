#!/bin/bash
set -euo pipefail
umask 077
cd /opt/labcafe-analytics
backup="/root/labcafe/yedekler/analytics/umami-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose exec -T db pg_dump -U labcafe_analytics -d labcafe_analytics --no-owner --no-acl | gzip > "$backup.tmp"
mv "$backup.tmp" "$backup"
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U labcafe_analytics -d labcafe_analytics <<'SQL'
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DELETE FROM event_data WHERE created_at < NOW()-INTERVAL '90 days';
DELETE FROM session_data WHERE created_at < NOW()-INTERVAL '90 days';
DELETE FROM session_link WHERE created_at < NOW()-INTERVAL '90 days';
DELETE FROM session_replay WHERE created_at < NOW()-INTERVAL '90 days';
DELETE FROM heatmap_event WHERE created_at < NOW()-INTERVAL '90 days';
DELETE FROM revenue WHERE created_at < NOW()-INTERVAL '90 days';
DELETE FROM website_event WHERE created_at < NOW()-INTERVAL '90 days';
DELETE FROM session s WHERE s.created_at < NOW()-INTERVAL '90 days' AND NOT EXISTS(SELECT 1 FROM website_event e WHERE e.session_id=s.session_id);
COMMIT;
SQL
python3 - <<'PY'
import datetime,os,sqlite3
path='/var/lib/labcafe/analytics-events.sqlite'
if os.path.isfile(path):
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 source=sqlite3.connect(path,timeout=2)
 target=sqlite3.connect('/root/labcafe/yedekler/analytics/conversions-'+stamp+'.sqlite')
 source.backup(target);target.close()
 cutoff=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=90)+datetime.timedelta(hours=3)).date().isoformat()
 source.execute('DELETE FROM metric_counts WHERE day<?',(cutoff,));source.commit();source.close()
PY
find /root/labcafe/yedekler/analytics -maxdepth 1 -type f -name 'umami-*.sql.gz' -mtime +7 -delete
find /root/labcafe/yedekler/analytics -maxdepth 1 -type f -name 'conversions-*.sqlite' -mtime +7 -delete
printf 'Analytics backup and 90-day retention completed.\n'
