<?php
declare(strict_types=1);

ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function field(array $input, string $name, int $max, bool $required = true): string {
    $value = $input[$name] ?? '';
    if (!is_string($value) || strlen($value) > $max || ($required && trim($value) === '')) {
        throw new InvalidArgumentException('Bitte überprüfe das Feld „' . $name . '“.');
    }
    return trim($value);
}

function dateField(array $input): string {
    $date = field($input, 'Datum', 10);
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date || $date < '0001-01-01') {
        throw new InvalidArgumentException('Bitte gib ein gültiges Datum ein.');
    }
    return $date;
}

function findIndex(array $items, string $id): int {
    foreach ($items as $index => $item) {
        if ($item['id'] === $id) {
            return $index;
        }
    }
    throw new OutOfBoundsException('Dieser Eintrag wurde nicht gefunden.');
}

function taskFields(array $input): array {
    return [
        'title' => field($input, 'Aufgabe', 480),
        'description' => field($input, 'Beschreibung', 12000, false),
        'date' => dateField($input),
    ];
}

function mutate(array &$lists, array $input): void {
    $action = $input['action'] ?? '';
    if ($action === 'createList') {
        $lists[] = [
            'id' => bin2hex(random_bytes(12)),
            'title' => field($input, 'Liste', 400),
            'event' => field($input, 'Ereignis', 400),
            'date' => dateField($input),
            'tasks' => [],
        ];
        return;
    }

    $listIndex = findIndex($lists, field($input, 'listId', 24));
    $list = &$lists[$listIndex];
    if ($action === 'createTask') {
        $list['tasks'][] = [
            'id' => bin2hex(random_bytes(12)),
            ...taskFields($input),
            'done' => false,
            'comments' => [],
        ];
        return;
    }

    $taskIndex = findIndex($list['tasks'], field($input, 'taskId', 24));
    if ($action === 'moveTask') {
        if (!array_key_exists('targetId', $input)) {
            $date = dateField($input);
            $task = $list['tasks'][$taskIndex];
            if ($date !== $task['date']) {
                $task['date'] = $date;
                array_splice($list['tasks'], $taskIndex, 1);
                $list['tasks'][] = $task;
            }
            return;
        }

        $targetIndex = findIndex($list['tasks'], field($input, 'targetId', 24));
        $position = $input['position'] ?? '';
        if ($taskIndex === $targetIndex || !in_array($position, ['before', 'after'], true)) {
            throw new InvalidArgumentException('Ungültige Position für die Aufgabe.');
        }

        $task = $list['tasks'][$taskIndex];
        $task['date'] = $list['tasks'][$targetIndex]['date'];
        array_splice($list['tasks'], $taskIndex, 1);
        $offset = $targetIndex - (int) ($taskIndex < $targetIndex) + (int) ($position === 'after');
        array_splice($list['tasks'], $offset, 0, [$task]);
        return;
    }

    $task = &$list['tasks'][$taskIndex];
    if ($action === 'editTask') {
        $task = array_replace($task, taskFields($input));
    } elseif ($action === 'setDone' && is_bool($input['done'] ?? null)) {
        $task['done'] = $input['done'];
    } elseif ($action === 'comment') {
        $author = field($input, 'Name', 240, false);
        $task['comments'][] = [
            'author' => $author === '' ? 'Gast' : $author,
            'text' => field($input, 'Kommentar', 8000),
            'createdAt' => gmdate(DATE_ATOM),
        ];
    } else {
        throw new InvalidArgumentException('Unbekannte Aktion.');
    }
}

function writeLists(string $path, array $lists): void {
    $json = json_encode($lists, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $temporary = tempnam(dirname($path), 'write-');
    if ($temporary === false) {
        throw new RuntimeException('Temporäre Datei konnte nicht erstellt werden.');
    }
    try {
        if (file_put_contents($temporary, $json) !== strlen($json) || !rename($temporary, $path)) {
            throw new RuntimeException('JSON-Datei konnte nicht gespeichert werden.');
        }
    } finally {
        if (is_file($temporary)) {
            unlink($temporary);
        }
    }
}

$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    respond(405, ['error' => 'Methode nicht unterstützt.']);
}
$input = [];
if ($method === 'POST') {
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') {
        respond(415, ['error' => 'JSON erwartet.']);
    }
    $body = file_get_contents('php://input', false, null, 0, 65537);
    if ($body === false || strlen($body) > 65536) {
        respond(413, ['error' => 'Die Anfrage ist zu groß.']);
    }
    $input = json_decode($body, true);
    if (!is_array($input)) {
        respond(400, ['error' => 'Ungültige Anfrage.']);
    }
}

try {
    $directory = getenv('COULDDO_DATA_DIR') ?: __DIR__ . '/data';
    $path = $directory . '/lists.json';
    $lock = fopen($directory . '/lists.lock', 'c');
    if ($lock === false) {
        throw new RuntimeException('Datenverzeichnis nicht beschreibbar.');
    }
    try {
        if (!flock($lock, $method === 'POST' ? LOCK_EX : LOCK_SH)) {
            throw new RuntimeException('Dateisperre fehlgeschlagen.');
        }
        $lists = is_file($path) ? json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR) : [];
        if (!is_array($lists) || !array_is_list($lists)) {
            throw new RuntimeException('Ungültiger Datenspeicher.');
        }
        if ($method === 'POST') {
            mutate($lists, $input);
            writeLists($path, $lists);
        }
    } finally {
        fclose($lock);
    }
    respond(200, ['lists' => $lists]);
} catch (InvalidArgumentException $error) {
    respond(422, ['error' => $error->getMessage()]);
} catch (OutOfBoundsException $error) {
    respond(404, ['error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('CouldDoList: ' . $error->getMessage());
    respond(500, ['error' => 'Die Daten konnten nicht geladen oder gespeichert werden.']);
}
