def reassign_shift(employees, callout_employee_id, shift_time):
    available = [
        e for e in employees if e["id"] != callout_employee_id and shift_time not in e["shifts"]
    ]
    scored = sorted(available, key=lambda e: e["fairness_score"])
    return scored[0] if scored else None
