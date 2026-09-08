# MCP Tool-Selection Audit — memory-server

**Overall selection accuracy: 81%** across 90 in-scope queries over 9 tools.

Over-triggering on out-of-scope queries: 39% (36 noise queries).

False-trigger rate on adversarial near-misses: 0% (36 negatives).

_Eval model: `claude-haiku-4-5` (temperature applied). Generation model: `claude-sonnet-5`. Tool-set hash: `5cf4c5c5af08`._

## Per-tool accuracy (worst first)

| Tool | Picked correctly | Wrong tool | Missed | False-trigger | n |
|---|---|---|---|---|---|
| `create_relations` | 20% | 80% (→ `create_entities` 50%) | 0% | 0% of 4 | 10 |
| `add_observations` | 50% | 50% (→ `create_entities` 40%) | 0% | 0% of 4 | 10 |
| `delete_observations` | 70% | 30% (→ `search_nodes` 20%) | 0% | 0% of 4 | 10 |
| `delete_entities` | 90% | 10% (→ `read_graph` 10%) | 0% | 0% of 4 | 10 |
| `create_entities` | 100% | 0% | 0% | 0% of 4 | 10 |
| `delete_relations` | 100% | 0% | 0% | 0% of 4 | 10 |
| `read_graph` | 100% | 0% | 0% | 0% of 4 | 10 |
| `search_nodes` | 100% | 0% | 0% | 0% of 4 | 10 |
| `open_nodes` | 100% | 0% | 0% | 0% of 4 | 10 |

## Confusion matrix

Rows = intended tool; entries = what got picked instead.

- `create_relations` → `create_entities` ×5, `search_nodes` ×2, `open_nodes` ×1
- `add_observations` → `create_entities` ×4, `open_nodes` ×1
- `delete_entities` → `read_graph` ×1
- `delete_observations` → `search_nodes` ×2, `open_nodes` ×1

## Concrete failures (worst 3 tools)

### `create_relations`
- "Can you add to the graph that Sarah manages the Marketing team, and that the Marketing team reports to the VP of Sales?" → **search_nodes** (wrong_tool)
- "I need to link John Doe as the author of the 'Q3 Report' document, and also connect that report to the Finance project it belongs to." → **search_nodes** (wrong_tool)
- "Please record that Acme Corp acquired Beta Inc last year, and that Beta Inc's CEO now advises Acme Corp's board." → **create_entities** (wrong_tool)
### `add_observations`
- "Can you remember that the Acme Corp deal closed at $2.4M and their contract renews every March?" → **create_entities** (wrong_tool)
- "Please note down that Sarah mentioned she's allergic to shellfish and prefers virtual meetings over in-person ones." → **create_entities** (wrong_tool)
- "I need to update my notes on the client 'Northwind Traders' — they switched their primary contact to Lisa Chen and their office moved to Chicago." → **open_nodes** (wrong_tool)
### `delete_observations`
- "Please delete the note 'allergic to peanuts' from Sarah's entry — that was a mistake, it was actually her sister who has that allergy." → **search_nodes** (wrong_tool)
- "Can you clean up the Project Phoenix entity by deleting the note that says 'budget approved for $50k'? That figure was never finalized." → **open_nodes** (wrong_tool)
- "Can you delete the note 'speaks fluent Spanish' from my profile? I never actually said that, not sure how it got added." → **search_nodes** (wrong_tool)
