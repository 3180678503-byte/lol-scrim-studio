"""Run a private Bilibili uploader for the public moments gallery (stdlib only)."""
import argparse
import base64
import contextlib
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'
BV_RE = re.compile(r'\bBV[A-Za-z0-9]{10}\b')
ID_RE = re.compile(r'^[a-f0-9-]{36}$')
COLLECTION_NAMES = {'highlight': '名场面', 'funny': '下饭操作', 'teamwork': '默契配合', 'meme': '整活现场'}


class JobError(Exception):
    pass


class CollectionError(JobError):
    pass


class Collections:
    """Private creator-center API; credentials never leave Bilibili's host."""
    def __init__(self, cookie_path):
        info = read_json(cookie_path)
        cookies = {str(c['name']): str(c['value']) for c in (info or {}).get('cookie_info', {}).get('cookies', [])}
        if not cookies.get('SESSDATA') or not cookies.get('bili_jct'):
            raise CollectionError('bilibili_collection_login_required')
        self.cookie = '; '.join(k + '=' + v for k, v in cookies.items())
        self.csrf = cookies['bili_jct']
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, form=None, payload=None):
        if not path.startswith(('/x2/creative/web/', '/x/vu/web/cover/up', '/x/vupre/web/archive/pre')):
            raise CollectionError('invalid_collection_api_path')
        headers = {'User-Agent': UA, 'Cookie': self.cookie, 'Referer': 'https://member.bilibili.com/platform/', 'Origin': 'https://member.bilibili.com'}
        body = None
        if form is not None:
            body = urllib.parse.urlencode({**form, 'csrf': self.csrf}).encode()
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        if payload is not None:
            path += ('&' if '?' in path else '?') + urllib.parse.urlencode({'csrf': self.csrf})
            body = json.dumps({**payload, 'csrf': self.csrf}).encode()
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request('https://member.bilibili.com' + path, data=body, headers=headers)
        try:
            with self.opener.open(req, timeout=30) as response:
                result = json.load(response)
        except (urllib.error.URLError, ValueError, TimeoutError, OSError):
            raise CollectionError('bilibili_collection_network_error') from None
        if result.get('code') != 0:
            error = CollectionError('bilibili_collection_rejected_' + str(result.get('code')))
            error.remote_message = str(result.get('message', ''))[:200]
            raise error
        return result.get('data')

    def can_create(self):
        data = self.request('/x/vupre/web/archive/pre') or {}
        if not isinstance(data.get('season'), bool):
            raise CollectionError('collection_permission_unknown')
        return data['season']

    def list(self):
        entries = []
        for pn in range(1, 101):
            data = self.request('/x2/creative/web/seasons?' + urllib.parse.urlencode({'pn': pn, 'ps': 30, 'order': 'mtime', 'sort': 'desc', 'draft': 1})) or {}
            page = data.get('seasons') or []
            entries.extend(page)
            if len(page) < 30:
                break
        return entries

    def upload_cover(self, path):
        content = pathlib.Path(path).read_bytes()
        if not content.startswith(b'\xff\xd8') or len(content) > 5000000:
            raise CollectionError('collection_cover_must_be_jpeg_under_5mb')
        data = self.request('/x/vu/web/cover/up', form={'cover': 'data:image/jpeg;base64,' + base64.b64encode(content).decode('ascii')}) or {}
        url = data.get('url', '')
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or not parsed.hostname.endswith(('.biliimg.com', '.hdslb.com')):
            raise CollectionError('unexpected_bilibili_cover_url')
        return url

    def create(self, title, description, cover):
        if not title or len(title) > 40:
            raise CollectionError('invalid_collection_title')
        result = self.request('/x2/creative/web/season/add', form={'title': title, 'desc': description, 'cover': cover, 'season_price': 0})
        if not isinstance(result, int) or result <= 0:
            raise CollectionError('unexpected_collection_create_response')
        return result

    def ensure_video(self, binding, video, mid):
        if binding.get('ownerMid') != mid or video.get('owner', {}).get('mid') != mid:
            raise CollectionError('collection_account_mismatch')
        season_id, section_id, aid = binding.get('seasonId'), binding.get('sectionId'), video.get('aid')
        if any(not isinstance(x, int) or x <= 0 for x in (season_id, section_id, aid)):
            raise CollectionError('invalid_collection_binding')
        if len(video.get('pages') or []) > 1:
            raise CollectionError('collection_requires_single_part_video')
        path = '/x2/creative/web/season/section?' + urllib.parse.urlencode({'id': section_id})
        def membership():
            data = self.request(path) or {}
            actual = data.get('section') or {}
            if actual.get('id') != section_id or actual.get('seasonId') != season_id:
                raise CollectionError('collection_section_mismatch')
            return any(ep.get('aid') == aid for ep in (data.get('episodes') or []))
        if membership():
            return 'already_present'
        cid = video.get('cid') or next((p.get('cid') for p in video.get('pages', []) if p.get('cid')), None)
        if not isinstance(cid, int) or cid <= 0:
            raise CollectionError('collection_video_has_no_cid')
        self.request('/x2/creative/web/season/section/episodes/add', payload={'sectionId': section_id, 'episodes': [{'aid': aid, 'cid': cid, 'title': video['title'], 'charging_pay': 0}]})
        if not membership():
            raise CollectionError('collection_membership_not_confirmed')
        return 'added'


def configure_collections(config_path, cover_directory):
    config = read_json(config_path)
    client = Collections(config['cookiePath'])
    mid = credential_mid(config['cookiePath'])
    if not client.can_create():
        raise CollectionError('bilibili_collections_not_enabled_for_account')
    covers = pathlib.Path(cover_directory)
    if any(not (covers / (category + '.jpg')).is_file() for category in COLLECTION_NAMES):
        raise CollectionError('four_collection_covers_required')
    state_path = pathlib.Path(config['privateRoot']) / 'collection-setup.json'
    state = read_json(state_path, {'items': {}})
    bindings = config.get('categoryCollections', {})
    for category, title in COLLECTION_NAMES.items():
        entries = client.list()
        existing = [entry for entry in entries if entry.get('season', {}).get('title') == title]
        if len(existing) > 1:
            raise CollectionError('ambiguous_existing_collection_' + category)
        record = state['items'].setdefault(category, {})
        if not existing:
            if not record.get('coverUrl'):
                record['coverUrl'] = client.upload_cover(covers / (category + '.jpg'))
                save_json(state_path, state)
            record['createdId'] = client.create(title, '英雄联盟群友游戏片段，按网站分类持续更新。', record['coverUrl'])
            save_json(state_path, state)
            existing = [entry for entry in client.list() if entry.get('season', {}).get('id') == record['createdId']]
        if len(existing) != 1:
            raise CollectionError('created_collection_not_visible')
        entry = existing[0]
        season = entry['season']
        sections = (entry.get('sections') or {}).get('sections') or []
        if season.get('mid') != mid or not sections:
            raise CollectionError('collection_owner_or_section_missing')
        section = next((s for s in sections if s.get('title') == '正片'), sections[0])
        bindings[category] = {'seasonId': season['id'], 'sectionId': section['id'], 'title': title, 'ownerMid': mid}
        config['categoryCollections'] = bindings
        save_json(config_path, config)
        record['binding'] = bindings[category]
        save_json(state_path, state)
    return bindings


def read_json(path, default=None):
    path = pathlib.Path(path)
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else default


def save_json(path, value):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def digest(path):
    sha = hashlib.sha256()
    with pathlib.Path(path).open('rb') as source:
        for part in iter(lambda: source.read(1024 * 1024), b''):
            sha.update(part)
    return sha.hexdigest()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class API:
    def __init__(self, base, key):
        parsed = urllib.parse.urlsplit(base)
        if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost')):
            raise JobError('worker_url_must_be_https')
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise JobError('invalid_worker_url')
        self.base, self.key = base.rstrip('/'), key
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, payload=None, target=None, lease=None):
        headers = {'User-Agent': UA, 'X-Archive-Key': self.key}
        if lease:
            headers['X-Archive-Lease'] = lease
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(self.base + path, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
        try:
            with self.opener.open(req, timeout=180) as response:
                if target:
                    temp = pathlib.Path(str(target) + '.part')
                    count = 0
                    with temp.open('wb') as out:
                        while part := response.read(1024 * 1024):
                            count += len(part)
                            if count > 100000000:
                                raise JobError('source_exceeds_limit')
                            out.write(part)
                    temp.replace(target)
                    return count
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise JobError('worker_http_' + str(error.code)) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise JobError('worker_network_error') from None


def public_video(bvid):
    if not BV_RE.fullmatch(bvid):
        raise JobError('invalid_bvid')
    req = urllib.request.Request('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, headers={'User-Agent': UA, 'Referer': 'https://www.bilibili.com/'})
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            result = json.load(response)
    except (urllib.error.URLError, ValueError, TimeoutError):
        raise JobError('bilibili_check_unavailable') from None
    if result.get('code') != 0:
        return None  # Not public yet: moderation, transcoding, rejected or removed.
    return result.get('data')


def verified_fields(video, bvid, mid):
    if not video or video.get('bvid') != bvid or video.get('state') != 0 or video.get('owner', {}).get('mid') != mid:
        return None
    cid = video.get('cid') or next((p.get('cid') for p in video.get('pages', []) if p.get('cid')), None)
    if not isinstance(cid, int) or cid <= 0:
        return None
    return {'bvid': bvid, 'ownerMid': mid, 'state': 0, 'cid': cid, 'checkedAt': int(time.time() * 1000)}


def credential_mid(path):
    info = read_json(path)
    if not info:
        raise JobError('login_required')
    mid = info.get('token_info', {}).get('mid')
    if not mid:
        mid = next((x.get('value') for x in info.get('cookie_info', {}).get('cookies', []) if x.get('name') == 'DedeUserID'), None)
    try:
        return int(mid)
    except (TypeError, ValueError):
        raise JobError('login_file_has_no_account') from None


def check_login(path, mid):
    info = read_json(path)
    cookies = info.get('cookie_info', {}).get('cookies', [])
    header = '; '.join(str(c['name']) + '=' + str(c['value']) for c in cookies)
    req = urllib.request.Request('https://api.bilibili.com/x/web-interface/nav', headers={'User-Agent': UA, 'Cookie': header, 'Referer': 'https://www.bilibili.com/'})
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            data = json.load(response)
    except (urllib.error.URLError, ValueError, TimeoutError):
        raise JobError('login_check_unavailable') from None
    if data.get('code') != 0 or not data.get('data', {}).get('isLogin') or data['data'].get('mid') != mid:
        raise JobError('login_expired_rescan_required')


def upload_command(config, job, source):
    marker = '名场面编号：' + job['id']
    description = (job.get('description') or '').strip() + '\n\n' + marker + '\n群友授权发布的英雄联盟游戏片段。'
    command = [config['biliupPath'], '-u', config['cookiePath']]
    if config.get('bilibiliProxy'):
        command += ['-p', config['bilibiliProxy']]
    # The command runs without a shell; a friend's title cannot become code.
    command += ['upload', '--submit', 'web', '--title', ('【峡谷名场面】' + job['title'])[:80], '--desc', description[:1900], '--tag', '英雄联盟,游戏集锦,峡谷名场面', '--copyright', '1', '--tid', '171', '--no-reprint', '1', '--limit', '2', str(source)]
    return command


@contextlib.contextmanager
def single_instance(root):
    root.mkdir(parents=True, exist_ok=True)
    stream = (root / 'runner.lock').open('a+b')
    if stream.tell() == 0:
        stream.write(b'0')
        stream.flush()
    stream.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        stream.close()
        raise JobError('another_runner_is_active') from None
    try:
        yield
    finally:
        stream.close()


class Runner:
    def __init__(self, config, api=None, inspect_video=public_video, execute=None, collections=None):
        self.config = config
        self.root = pathlib.Path(config['privateRoot']).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.api = api or API(config['workerUrl'], config['archiveKey'])
        self.inspect = inspect_video
        self.execute = execute or self.execute_cli
        self.mid = credential_mid(config['cookiePath'])
        self.collections = collections or (Collections(config['cookiePath']) if config.get('categoryCollections') else None)
        self.events = []

    def note(self, event, **values):
        self.events.append({'event': event, **values})

    def record_path(self, job_id):
        if not ID_RE.fullmatch(job_id):
            raise JobError('invalid_job_id')
        return self.root / 'receipts' / (job_id + '.json')

    def source_path(self, job_id):
        self.record_path(job_id)
        path = self.root / 'backups' / (job_id + '.mp4')
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def execute_cli(self, command):
        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        try:
            # Captured logs can contain credentials refreshed by third-party code.
            # They stay in memory and are never copied into files or error reports.
            p = subprocess.run(command, cwd=self.root, capture_output=True, timeout=1200, creationflags=flags)
            return p.returncode, (p.stdout + p.stderr).decode('utf-8', 'replace')
        except (OSError, subprocess.TimeoutExpired):
            raise JobError('submission_outcome_uncertain') from None

    def collection_target(self, job, bvid):
        binding = self.config.get('categoryCollections', {}).get(job.get('category'))
        if not binding:
            return None
        return {**binding, 'bvid': bvid}

    def ensure_collection(self, job, video):
        target = self.collection_target(job, video['bvid'])
        if not target:
            return True
        receipt = read_json(self.record_path(job['id']), {})
        if receipt.get('collection') == target:
            return True
        try:
            self.collections.ensure_video(target, video, self.mid)
            receipt['collection'] = target
            save_json(self.record_path(job['id']), receipt)
            self.note('added_to_category_collection', id=job['id'], category=job['category'], title=target['title'])
            return True
        except CollectionError as error:
            self.note('collection_will_retry', id=job['id'], reason=str(error))
            return False

    def reconcile_and_verify(self, jobs, release=True):
        for job in jobs:
            job_id = job['id']
            receipt = read_json(self.record_path(job_id), {})
            bvid = job.get('bvid') or receipt.get('bvid')
            if not bvid:
                if job['state'] in ('submitting', 'manual'):
                    self.note('needs_manual_reconciliation', id=job_id)
                continue
            if job['state'] in ('submitting', 'manual'):
                self.api.request('/archive/jobs/' + job_id + '/submitted', {'bvid': bvid, 'ownerMid': self.mid})
            if job['state'] not in ('submitting', 'manual', 'submitted', 'ready'):
                continue
            retention = max(1, int(self.config.get('retainDays', 7))) * 86400000
            collection_target = self.collection_target(job, bvid)
            needs_collection = bool(collection_target and receipt.get('collection') != collection_target)
            if job['state'] == 'ready' and not needs_collection and int(time.time() * 1000) - (job.get('readyAt') or int(time.time() * 1000)) < retention:
                continue
            video = self.inspect(bvid)
            check = verified_fields(video, bvid, self.mid)
            if not check:
                self.note('waiting_for_public_playback', id=job_id)
                continue
            if '名场面编号：' + job_id not in video.get('desc', ''):
                self.note('video_marker_mismatch', id=job_id)
                continue
            self.api.request('/archive/jobs/' + job_id + '/verified', check)
            self.note('public_playback_verified', id=job_id, bvid=bvid)
            if not self.ensure_collection(job, video):
                continue
            backup = self.source_path(job_id)
            age = int(time.time() * 1000) - (job.get('readyAt') or int(time.time() * 1000))
            if release and not job.get('sourceDeletedAt') and age >= retention:
                if not receipt.get('sha256') or not backup.exists() or digest(backup) != receipt['sha256']:
                    self.note('original_retained_backup_missing', id=job_id)
                    continue
                self.api.request('/archive/jobs/' + job_id + '/release', {'localBackupSha256': receipt['sha256']})
                self.note('r2_source_released_local_backup_kept', id=job_id)

    def submit_one(self, job):
        job_id, token = job['id'], job['leaseToken']
        base = '/archive/jobs/' + job_id
        record = read_json(self.record_path(job_id), {})
        if record.get('phase') in ('submitting', 'submitted'):
            self.note('local_receipt_prevents_duplicate', id=job_id)
            return
        submitted = False
        try:
            source = self.source_path(job_id)
            self.api.request(base + '/source', target=source, lease=token)
            if source.stat().st_size != job['size']:
                raise JobError('download_size_mismatch')
            with source.open('rb') as stream:
                if stream.read(8)[4:8] != b'ftyp':
                    raise JobError('download_not_mp4')
            record = {'id': job_id, 'sha256': digest(source), 'phase': 'downloaded', 'ownerMid': self.mid, 'category': job.get('category')}
            save_json(self.record_path(job_id), record)
            self.api.request(base + '/submitting', {'leaseToken': token})
            record.update(phase='submitting', startedAt=int(time.time() * 1000))
            save_json(self.record_path(job_id), record)
            submitted = True
            code, output = self.execute(upload_command(self.config, job, source))
            candidates = set(BV_RE.findall(output))
            if code != 0 or len(candidates) != 1:
                raise JobError('submission_outcome_uncertain')
            bvid = candidates.pop()
            record.update(phase='submitted', bvid=bvid)
            save_json(self.record_path(job_id), record)
            self.api.request(base + '/submitted', {'bvid': bvid, 'ownerMid': self.mid})
            self.note('submitted_waiting_for_review', id=job_id, bvid=bvid)
        except JobError:
            # If publication may have happened, never issue a second upload.
            try:
                self.api.request(base + '/failed', {'leaseToken': token})
            except JobError:
                pass
            self.note('needs_manual_reconciliation' if submitted else 'download_will_retry', id=job_id)

    def run(self, publish=False):
        jobs = self.api.request('/archive/jobs')['items']
        if not publish:
            self.note('dry_run', jobs=len(jobs), ownerMid=self.mid)
            return self.events
        self.reconcile_and_verify(jobs)
        today = time.strftime('%Y-%m-%d', time.gmtime(time.time() + 8 * 3600))
        daily = read_json(self.root / 'daily.json', {})
        if daily.get('date') != today:
            daily = {'date': today, 'count': 0}
        for _ in range(max(0, min(int(self.config.get('maxPerRun', 2)), int(self.config.get('maxPerDay', 20)) - daily['count']))):
            job = self.api.request('/archive/claim', {}).get('job')
            if not job:
                break
            daily['count'] += 1
            save_json(self.root / 'daily.json', daily)
            self.submit_one(job)
        return self.events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=pathlib.Path)
    parser.add_argument('--publish', action='store_true', help='Actually submit consented videos and release verified R2 originals')
    parser.add_argument('--doctor', action='store_true')
    parser.add_argument('--login', action='store_true')
    collection_options = parser.add_mutually_exclusive_group()
    collection_options.add_argument('--collections', action='store_true', help='Read account collection permission and existing collections')
    collection_options.add_argument('--setup-collections', action='store_true', help='Create or reuse four category collections and save private bindings')
    parser.add_argument('--collection-covers', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / 'assets' / 'collection-covers')
    parser.add_argument('--attach', nargs=2, metavar=('MOMENT_ID', 'BVID'), help='Recover a known publication; validates account and description marker')
    args = parser.parse_args()
    cfg = read_json(args.config)
    if not cfg:
        raise JobError('private_config_missing')
    if args.login:
        pathlib.Path(cfg['cookiePath']).parent.mkdir(parents=True, exist_ok=True)
        return subprocess.call([cfg['biliupPath'], '-u', cfg['cookiePath'], 'login'], cwd=cfg['privateRoot'])
    if args.doctor:
        report = {'biliupInstalled': pathlib.Path(cfg['biliupPath']).is_file(), 'workerConfigured': bool(cfg.get('workerUrl') and cfg.get('archiveKey')), 'loggedIn': pathlib.Path(cfg['cookiePath']).is_file(), 'retainDays': cfg.get('retainDays', 7)}
        if report['loggedIn']:
            report['ownerMid'] = credential_mid(cfg['cookiePath'])
        print(json.dumps(report, ensure_ascii=False))
        return 0
    if args.collections or args.setup_collections:
        mid = credential_mid(cfg['cookiePath'])
        check_login(cfg['cookiePath'], mid)
        if args.collections:
            client = Collections(cfg['cookiePath'])
            print(json.dumps({'canCreateCollections': client.can_create(), 'collections': [{'id': e['season']['id'], 'title': e['season']['title']} for e in client.list()]}, ensure_ascii=False))
        else:
            with single_instance(pathlib.Path(cfg['privateRoot'])):
                print(json.dumps({'categoryCollections': configure_collections(args.config, args.collection_covers)}, ensure_ascii=False))
        return 0
    root = pathlib.Path(cfg['privateRoot'])
    with single_instance(root):
        runner = Runner(cfg)
        if args.publish or args.attach:
            check_login(cfg['cookiePath'], runner.mid)
        if args.attach:
            job_id, bvid = args.attach
            runner.record_path(job_id)
            video = public_video(bvid)
            if not verified_fields(video, bvid, runner.mid) or '名场面编号：' + job_id not in video.get('desc', ''):
                raise JobError('recovery_video_does_not_match')
            runner.api.request('/archive/jobs/' + job_id + '/submitted', {'bvid': bvid, 'ownerMid': runner.mid})
            print(json.dumps({'recovered': job_id, 'bvid': bvid}))
            return 0
        events = runner.run(args.publish)
        result = {'time': int(time.time() * 1000), 'publish': args.publish, 'events': events}
        save_json(root / 'last-run.json', result)
        print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except JobError as error:
        # Error messages are fixed internal codes; no cookies or HTTP bodies.
        print(json.dumps({'ok': False, 'reason': str(error)}, ensure_ascii=False))
        sys.exit(2)
