# Example

Input:

```bash
python scripts/summarize_logs.py --input examples/sample-logs.csv --top 3
```

Expected output shape:

```markdown
## Log Summary
- Total rows: 5
- Levels: ERROR 2, INFO 2, WARN 1

## Top Messages
1. [2] Database connection timeout
2. [1] Worker started
3. [1] Retry queue depth exceeded threshold
```
