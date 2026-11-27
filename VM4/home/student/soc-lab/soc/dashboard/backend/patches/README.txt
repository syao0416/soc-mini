This addon patches monitoring/views.py in place via setup-live-dashboard.ps1:
- API event payload receives review_note, so a saved note can be loaded again.
- Only is_superuser can approve/reject review requests, consistent with UI admin role.
