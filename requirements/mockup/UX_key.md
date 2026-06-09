Key UX decisions dalam mockup ini:
Layout 4-panel:

* Sidebar → navigasi utama (Test Cases, Test Runs, Reports, Jira Sync)
* Suite Tree Panel → folder hierarchy mirip AIO Test, collapsible, drag-and-drop urutan
* Test Case Table → sortable columns, multi-select untuk bulk action (assign, delete, run)
* Detail Panel → slide-in kanan saat klik TC, tanpa pindah halaman (no full page reload)

Test Case Table — kolom esensial:

* ID (monospace, sortable) → Title + metadata kecil (suite name · scenario type) → Priority badge → Type badge → Status badge → Updated timestamp
* Filter chips di toolbar: All / Critical / Failed / Blocked / Not Run → quick filter paling sering dipakai QA
* Progress bar di status bar bawah → langsung tahu coverage cycle saat ini

Test Suite (Cycle equivalent):

* Tree hierarchy: Suite → Sub-suite → Test Cases
* Count badge di setiap node
* Bisa dijadikan "Cycle" dengan menambahkan kolom "Run date" dan "Assignee" di level suite