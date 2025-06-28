from fastapi import FastAPI
from engine import reassign_shift
import json

app = FastAPI()

@app.get("/reassign/{employee_id}/{shift_time}")
def reassign(employee_id: str, shift_time: str):
    with open('../data/employees.json') as f:
        employees = json.load(f)
    result = reassign_shift(employees, employee_id, shift_time)
    return result
