<?php
// API de synchronisation : fiches (groupe, musiciens, morceaux, sets, plans de scène) et fichiers joints, par groupe.
// Accès : en-têtes X-Band (nom du groupe) et X-Code (code d'accès partagé par les musiciens).
declare(strict_types=1);

const MAX_FILE = 200 * 1024 * 1024;   // taille maximale d'un fichier joint
const MAX_DOC = 12 * 1024 * 1024;     // taille maximale d'une fiche (JSON)

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $code, int $status, string $msg = ''): void { out(['error' => $code, 'message' => $msg], $status); }

set_exception_handler(function (Throwable $e) {
    error_log('sync: ' . $e->getMessage());
    fail('server', 500, 'Erreur du serveur de synchronisation.');
});

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) fail('not_configured', 503, "La synchronisation n'est pas configurée sur ce serveur.");
$config = require $configFile;

$db = new PDO($config['dsn'], $config['user'] ?? null, $config['password'] ?? null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$filesDir = $config['files_dir'] ?? (__DIR__ . '/files');

function q(PDO $db, string $sql, array $args = []): PDOStatement { $st = $db->prepare($sql); $st->execute($args); return $st; }
function now_ms(): int { return (int) floor(microtime(true) * 1000); }
function schema(PDO $db): void {
    $db->exec('CREATE TABLE IF NOT EXISTS dow_bands (slug VARCHAR(64) NOT NULL PRIMARY KEY, code_hash VARCHAR(255) NOT NULL, rev BIGINT NOT NULL DEFAULT 0, created BIGINT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS dow_docs (band VARCHAR(64) NOT NULL, kind VARCHAR(16) NOT NULL, id VARCHAR(64) NOT NULL, data MEDIUMTEXT, deleted INTEGER NOT NULL DEFAULT 0, rev BIGINT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY (band, kind, id))');
    $db->exec('CREATE TABLE IF NOT EXISTS dow_files (band VARCHAR(64) NOT NULL, id VARCHAR(64) NOT NULL, mime VARCHAR(128) NOT NULL, size BIGINT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY (band, id))');
}

// ---- Identification du groupe ----
$slug = strtolower(trim($_SERVER['HTTP_X_BAND'] ?? ''));
$code = (string) ($_SERVER['HTTP_X_CODE'] ?? '');
if (!preg_match('/^[a-z0-9][a-z0-9-]{1,62}$/', $slug)) fail('bad_band', 400, 'Nom de groupe invalide.');
if (strlen($code) < 4 || strlen($code) > 200) fail('bad_code', 400, "Le code d'accès doit comporter au moins 4 caractères.");

try { $band = q($db, 'SELECT * FROM dow_bands WHERE slug = ?', [$slug])->fetch(); }
catch (PDOException $e) { schema($db); $band = false; }
$created = false;
if (!$band && !empty($_GET['nocreate'])) {
    // Connexion à un groupe existant : une faute de frappe dans le nom ne doit pas créer un groupe vide.
    fail('no_band', 404, "Aucun groupe de ce nom sur le serveur. Vérifiez l'orthographe, ou créez le groupe depuis l'onglet Données.");
}
if ($band && !empty($_GET['mustcreate'])) {
    // Création d'un groupe : le nom doit être libre.
    fail('exists', 409, 'Ce nom de groupe est déjà utilisé. Choisissez-en un autre, ou utilisez « Se connecter à mon groupe ».');
}
if (!$band) {
    // Premier appareil à utiliser ce nom de groupe : il en fixe le code d'accès.
    try { q($db, 'INSERT INTO dow_bands (slug, code_hash, rev, created) VALUES (?, ?, 0, ?)', [$slug, password_hash($code, PASSWORD_DEFAULT), now_ms()]); $created = true; }
    catch (PDOException $e) { /* créé entre-temps par un autre appareil */ }
    $band = q($db, 'SELECT * FROM dow_bands WHERE slug = ?', [$slug])->fetch();
}
if (!$band || (!$created && !password_verify($code, $band['code_hash']))) {
    sleep(1);
    fail('forbidden', 403, "Code d'accès incorrect pour ce groupe.");
}

$action = $_GET['a'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$validId = fn($v) => is_string($v) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $v);

if ($action === 'ping') out(['ok' => true, 'created' => $created, 'rev' => (int) $band['rev']]);

// ---- Fiches : récupérer les changements depuis une révision ----
if ($action === 'pull' && $method === 'GET') {
    $since = (int) ($_GET['since'] ?? 0);
    $rev = (int) q($db, 'SELECT rev FROM dow_bands WHERE slug = ?', [$slug])->fetchColumn();
    $rows = q($db, 'SELECT kind, id, data, deleted, rev, updated FROM dow_docs WHERE band = ? AND rev > ? AND rev <= ? ORDER BY rev', [$slug, $since, $rev])->fetchAll();
    $docs = array_map(fn($r) => ['k' => $r['kind'], 'id' => $r['id'], 'd' => $r['deleted'] ? null : $r['data'], 'del' => (int) $r['deleted'], 'rev' => (int) $r['rev'], 't' => (int) $r['updated']], $rows);
    out(['rev' => $rev, 'docs' => $docs]);
}

// ---- Fiches : envoyer des changements ----
if ($action === 'push' && $method === 'POST') {
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body) || !is_array($body['docs'] ?? null)) fail('bad_request', 400, 'Requête invalide.');
    $kinds = ['band', 'musician', 'song', 'set', 'stageplan', 'meta'];
    foreach ($body['docs'] as $d) {
        if (!in_array($d['k'] ?? '', $kinds, true) || !$validId($d['id'] ?? null)) fail('bad_request', 400, 'Fiche invalide.');
        if (empty($d['del']) && (!is_string($d['d'] ?? null) || strlen($d['d']) > MAX_DOC || json_decode($d['d']) === null)) fail('bad_request', 400, 'Contenu de fiche invalide.');
    }
    $db->beginTransaction();
    $t = now_ms();
    $n = count($body['docs']);
    q($db, 'UPDATE dow_bands SET rev = rev + ? WHERE slug = ?', [$n, $slug]);   // verrouille le groupe et réserve les révisions
    $rev = (int) q($db, 'SELECT rev FROM dow_bands WHERE slug = ?', [$slug])->fetchColumn() - $n;
    foreach ($body['docs'] as $d) {
        $rev++;
        $del = empty($d['del']) ? 0 : 1;
        $data = $del ? null : $d['d'];
        // Heure de la modification sur l'appareil (départage deux modifications concurrentes), jamais dans le futur.
        $at = (int) ($d['t'] ?? 0);
        $at = ($at > 0 && $at < $t) ? $at : $t;
        $exists = q($db, 'SELECT 1 FROM dow_docs WHERE band = ? AND kind = ? AND id = ?', [$slug, $d['k'], $d['id']])->fetchColumn();
        if ($exists) q($db, 'UPDATE dow_docs SET data = ?, deleted = ?, rev = ?, updated = ? WHERE band = ? AND kind = ? AND id = ?', [$data, $del, $rev, $at, $slug, $d['k'], $d['id']]);
        else q($db, 'INSERT INTO dow_docs (band, kind, id, data, deleted, rev, updated) VALUES (?, ?, ?, ?, ?, ?, ?)', [$slug, $d['k'], $d['id'], $data, $del, $rev, $at]);
    }
    $db->commit();
    out(['ok' => true, 'rev' => $rev]);
}

// ---- Fichiers joints ----
if ($action === 'file') {
    $id = $_GET['id'] ?? '';
    if (!$validId($id)) fail('bad_request', 400, 'Identifiant de fichier invalide.');
    $dir = $filesDir . '/' . $slug;
    $path = $dir . '/' . $id;
    if ($method === 'HEAD' || $method === 'GET') {
        $row = q($db, 'SELECT mime, size FROM dow_files WHERE band = ? AND id = ?', [$slug, $id])->fetch();
        if (!is_file($path)) fail('not_found', 404, 'Fichier absent du serveur.');
        // Fichier déposé directement dans le dossier du groupe (sans passer par l'application) : type déduit du contenu.
        if (!$row) $row = ['mime' => (function_exists('mime_content_type') ? (mime_content_type($path) ?: '') : '') ?: 'application/octet-stream'];
        if ($method === 'HEAD') { http_response_code(200); exit; }
        $mime = preg_match('#^[\w.+-]+/[\w.+-]+$#', $row['mime']) ? $row['mime'] : 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment');
        readfile($path);
        exit;
    }
    if ($method === 'PUT' || $method === 'POST') {
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_FILE) fail('too_large', 413, 'Fichier trop volumineux (200 Mo au maximum).');
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) fail('server', 500, 'Stockage indisponible.');
        $tmp = $path . '.part' . bin2hex(random_bytes(4));
        $in = fopen('php://input', 'rb');
        $outF = fopen($tmp, 'wb');
        $size = 0;
        while (!feof($in)) {
            $chunk = fread($in, 1 << 20);
            if ($chunk === false) break;
            $size += strlen($chunk);
            if ($size > MAX_FILE) { fclose($outF); unlink($tmp); fail('too_large', 413, 'Fichier trop volumineux (200 Mo au maximum).'); }
            fwrite($outF, $chunk);
        }
        fclose($in); fclose($outF);
        $expected = (int) ($_SERVER['HTTP_X_SIZE'] ?? -1);
        if ($size === 0 || ($expected >= 0 && $expected !== $size)) { unlink($tmp); fail('incomplete', 400, 'Envoi du fichier incomplet.'); }
        rename($tmp, $path);
        $mime = substr((string) ($_SERVER['CONTENT_TYPE'] ?? 'application/octet-stream'), 0, 120);
        q($db, 'DELETE FROM dow_files WHERE band = ? AND id = ?', [$slug, $id]);
        q($db, 'INSERT INTO dow_files (band, id, mime, size, updated) VALUES (?, ?, ?, ?, ?)', [$slug, $id, $mime, $size, now_ms()]);
        out(['ok' => true, 'size' => $size]);
    }
}

fail('bad_request', 400, 'Action inconnue.');
