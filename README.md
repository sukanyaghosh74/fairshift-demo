# FairShift: AI Manager Microdemo 🧠🍽️

FairShift is a microdemo for an AI-powered shift reallocation tool tailored to the hospitality industry. It demonstrates real-time, fairness-based shift assignment when an employee calls out unexpectedly.

---

## 🚀 Features

- 🔄 Real-time AI-driven shift reassignment
- 🤖 Backend built with FastAPI (Python)
- 💻 Frontend using React + Vite + Tailwind CSS
- 🧪 One-click demo with sample employee data
- 🧠 "Fairness Threshold" protocol to ensure equitable shift distribution

---

## 🛠️ Getting Started

### 1. Backend (Python + FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

👉 Visit: [http://127.0.0.1:8000](http://127.0.0.1:8000)

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

👉 Visit: [http://localhost:5173](http://localhost:5173)

---

## 🧠 API Endpoint

### GET `/reassign/{employee_id}/{shift_time}`

Returns the best replacement candidate (based on lowest fairness score) for the given shift.

Example:
```bash
curl http://127.0.0.1:8000/reassign/1/mon_am
```

---

## 📂 Folder Structure

```
fairshift-demo/
├── backend/         → FastAPI + fairness logic
│   ├── app.py
│   └── engine.py
│   └── requirements.txt
├── frontend/        → Vite + React UI
│   ├── public/
│   └── src/
│       ├── index.css
│       ├── main.jsx
│       ├── App.jsx
│       └── components/
│           └── ShiftTable.jsx
├── data/            → Sample employee JSON data
│   └── employees.json
└── README.md
```

---

## 📊 Fairness Protocol

This demo uses a simple rule engine to:
- Identify employees who are available
- Sort them by their fairness score (lower = more eligible)
- Reassign shifts to avoid burnout and ensure equity

---

## ✨ Built For

This demo was designed as a **proof-of-concept for Bespoke**, an AI Manager platform for the hospitality sector. It showcases a real-world use case of human-centric automation.

---

## 🙋‍♀️ Author

Made with 🩷 by [Sukanya Ghosh](https://github.com/sukanyaghosh74)

---

> “Perfecting AI managers that guide human work, optimize business operations, and delight customers at scale.”
