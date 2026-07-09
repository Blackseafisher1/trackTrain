# GymTrack Local – Finale Spezifikation (MVP)

**Version:** 1.0  
**Typ:** Local-First Progressive Web App (Frontend-only)  
**Framework:** Svelte 5  
**Datenbank:** SQLite WASM + OPFS + SyncAccessHandle (opfs-sahpool VFS)  
**Ziel:** Einfaches, sauberes und komplett lokales Tracking von Krafttrainings

---

## 1. Projektübersicht & Ziele

GymTrack Local ist eine **Local-First PWA** für das Tracking von Krafttraining.

**Kernprinzipien:**
- Alles bleibt lokal auf dem Gerät
- Sauberes relationales Datenmodell mit SQLite
- Funktioniert komplett offline
- Installierbar als native App (iOS + Android)
- Hohe Sauberkeit und Wartbarkeit durch relationales SQL-Modell

---


## 2. Funktionale Anforderungen (MVP)

### 2.1 Übungsbibliothek
- Vordefinierte Liste von ca. 60–80 gängigen Kraftübungen
- Kategorisiert nach Muskelgruppen (z. B. Brust, Rücken, Beine, Schultern, Arme, Core)
- Möglichkeit, eigene Übungen hinzuzufügen, zu bearbeiten und zu löschen
- Suche und Filter in der Bibliothek
- Jede Übung hat: Name, Muskelgruppen, optionale Beschreibung

### 2.2 Workout-Logging (wichtigste Funktion)
- "Training starten" Button → neues Workout mit aktuellem Datum
- Optional: Workout-Name (z. B. "Push Day") und Notizen
- Übungen aus der Bibliothek oder ad-hoc hinzufügen
- Pro Übung beliebig viele Sätze loggen:
  - **Gewicht (kg)** mit großen +/- Buttons (z. B. ±2,5 kg)
  - **Wiederholungen (Reps)**
  - Optional: **RPE** (Rate of Perceived Exertion 1–10)
  - Optional: Notizen pro Satz
- Sehr schnelle Eingabe (optimiert für einhändige Bedienung)
- Automatische Berechnung von Gesamtvolumen (Gewicht × Reps)
- Optional: Einfacher Rest-Timer zwischen Sätzen (60s / 90s / 120s)
- Training beenden mit Summary

### 2.3 Historie
- Liste aller vergangenen Workouts (neueste zuerst)
- Detailansicht mit allen Übungen und Sätzen
- Möglichkeit, ein altes Workout als Vorlage zu duplizieren
- Workouts löschen

### 2.4 Fortschrittsverfolgung (Progress)
- Pro Übung: Historie der letzten Trainings ansehen
- Wichtige Kennzahlen: Max. Gewicht, Gesamtvolumen, Anzahl Sätze
- Einfache Tabelle + optionales Diagramm (z. B. Max-Gewicht über Zeit)
- Persönliche Rekorde (PRs) hervorheben

### 2.5 Trainingsroutinen (optional im MVP)
- Einfache Vorlagen erstellen (z. B. "Full Body A", "Push", "Pull")
- Eine Routine = geordnete Liste von Übungen
- Beim Starten eines Trainings: Routine laden → Übungen werden automatisch hinzugefügt


---

## 3. Datenmodell (relational mit SQLite)

```sql
-- Übungen
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  muscle_groups TEXT,        -- JSON array or comma-separated
  category TEXT,             -- 'strength' | 'cardio'
  description TEXT,
  is_custom BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workouts
CREATE TABLE workouts (
  id INTEGER PRIMARY KEY,
  date DATETIME NOT NULL,
  name TEXT,
  notes TEXT,
  duration_minutes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Verknüpfung Workout ↔ Übung (für Ordnung)
CREATE TABLE workout_exercises (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES exercises(id),
  exercise_order INTEGER NOT NULL,
  UNIQUE(workout_id, exercise_order)
);

-- Sätze
CREATE TABLE sets (
  id INTEGER PRIMARY KEY,
  workout_exercise_id INTEGER REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_order INTEGER NOT NULL,
  weight_kg REAL,
  reps INTEGER,
  rpe REAL,                  -- 1-10
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indizes für gute Performance
CREATE INDEX idx_workouts_date ON workouts(date);
CREATE INDEX idx_sets_workout ON sets(workout_exercise_id);