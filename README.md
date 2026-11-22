# CouldDoList

Deutschsprachige Aufgabenplanung für Ereignisse wie Weihnachten, Ostern oder Urlaub. Jede Liste hat einen Zieltermin und zeigt ihre Aufgaben nach Fälligkeit auf einer Zeitleiste. Aufgaben können kommentiert, abgeschlossen und wieder geöffnet werden.

## Auf den Webspace kopieren

1. Die Dateien `index.html`, `style.css`, `app.js`, `api.php` und den Ordner `data/` in einen Ordner auf einem Webspace mit **PHP 8.1 oder neuer** hochladen. Die versteckte Datei `data/.htaccess` gehört dazu.
2. Dem PHP-Prozess Schreibrechte für `data/` geben.
3. Den Ordner im Browser öffnen. PHP legt beim ersten Speichern `data/lists.json` an.

Beim üblichen Apache-Webspace muss `.htaccess` im Datenordner wirksam sein. Bei Nginx den direkten Zugriff auf `data/` in der Serverkonfiguration sperren oder `COULDDO_DATA_DIR` in der PHP-Umgebung auf ein vorhandenes, beschreibbares Verzeichnis außerhalb des Webroots setzen.

Alle Besucher derselben Installation teilen sich die Listen und können sie bearbeiten. Wenn nur bestimmte Personen Zugriff haben sollen, lässt sich der Ordner über den Webspace schützen. Für Backups genügt eine Kopie von `lists.json`.

## Lokal starten

```sh
mkdir -p /tmp/coulddolist-data
COULDDO_DATA_DIR=/tmp/coulddolist-data php -S 127.0.0.1:8080
```

Anschließend `http://127.0.0.1:8080/` öffnen.
