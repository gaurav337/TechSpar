"""Built-in preset training domains and default core knowledge scaffolding."""
import json
from textwrap import dedent

from backend.config import settings


PRESET_TOPICS = [
    {
        "key": "java",
        "name": "Java",
        "icon": "Cpu",
        "dir": "01_Java",
        "readme": dedent(
            """\
            # Java

            ## Most Frequently Tested
            - Collections framework, Generics, Concurrency, JVM, Exception handling, IO/NIO, Reflection, Annotations.
            - Interviews usually go beyond API usage to implementation mechanisms, thread safety, and performance impact.

            ## Common Follow-up Questions
            - Differences and use cases for HashMap, ConcurrentHashMap, ArrayList, LinkedList.
            - synchronized, volatile, Lock, CAS, thread pool limits, and common issues.
            - How class loading, memory models, and GC behavior affect online performance and stability.

            ## Core Knowledge Boundaries
            ### 1. Language Basics & OOPs
            - Pass-by-value, overloading/overriding, interfaces vs abstract classes, access control, exception hierarchy.

            ### 2. Collections & Generics
            - Underlying structures of common collections, resizing mechanisms, traversal methods, type erasure.

            ### 3. Concurrent Programming
            - Java Memory Model, visibility/ordering, locks, thread pools, concurrent collections.

            ### 4. JVM
            - Runtime memory areas, class loading flow, garbage collection, common tuning approaches.

            ### 5. IO & Reflection
            - BIO/NIO basics, serialization, reflection and annotation limits.
            """
        ),
    },
    {
        "key": "python",
        "name": "Python",
        "icon": "Terminal",
        "dir": "02_Python",
        "readme": dedent(
            """\
            # Python

            ## Most Frequently Tested
            - Decorators, generators, iterators, closures, coroutines, GIL, common containers, memory management.
            - The focus is on language mechanisms rather than just syntax.

            ## Common Follow-up Questions
            - Characteristics and underlying behavior of list, dict, set.
            - How generators and coroutines work, and what problems they solve.
            - Why multi-threading is limited by the GIL, and when to use multi-processing vs async.

            ## Core Knowledge Boundaries
            ### 1. Data Model
            - Mutable/immutable objects, reference counting, variable scope, objects and classes.

            ### 2. Functional Programming
            - Closures, decorators, context managers, argument passing, exception handling.

            ### 3. Iteration & Async
            - Iterators, generators, yield, coroutines, event loop.

            ### 4. Concurrency Model
            - GIL, multi-threading, multi-processing, async IO differences and trade-offs.

            ### 5. Software Engineering
            - Package management, virtual environments, logging, performance profiling, code organization.
            """
        ),
    },
    {
        "key": "javascript",
        "name": "JavaScript",
        "icon": "Zap",
        "dir": "03_JavaScript",
        "readme": dedent(
            """\
            # JavaScript

            ## Most Frequently Tested
            - Scope, closures, prototype chain, this binding, event loop, Promise, modularity.
            - Execution mechanisms in both browser and Node.js are highly popular.

            ## Common Follow-up Questions
            - Predicting code execution order (macro-tasks vs micro-tasks).
            - Prototype inheritance, object model, new operator, bind/call/apply mechanisms.
            - Promise, async/await error propagation, and concurrency control.

            ## Core Knowledge Boundaries
            ### 1. Language Basics
            - Type system, type coercion, scopes, closures, execution context.

            ### 2. Object Model
            - Prototype chain, inheritance, this binding rules, object instantiation.

            ### 3. Async Mechanisms
            - Event loop, task queues, Promise chaining, async/await.

            ### 4. Modules & Runtime
            - CommonJS, ESM, browser vs Node.js differences.

            ### 5. Common Pitfalls
            - Implicit type conversion, closure misuse, race conditions, memory leaks.
            """
        ),
    },
    {
        "key": "go",
        "name": "Go",
        "icon": "Rocket",
        "dir": "04_Go",
        "readme": dedent(
            """\
            # Go

            ## Most Frequently Tested
            - slice, map, channel, goroutine, interface, context, defer, GC.
            - Focus is on concurrency models and system engineering capabilities.

            ## Common Follow-up Questions
            - Slice growth, sharing underlying arrays, copy semantics.
            - How channel and goroutine collaborate, blockages and memory leaks.
            - How context handles timeout, cancellation, and error handling across requests.

            ## Core Knowledge Boundaries
            ### 1. Types & Syntax
            - Pointers, structs, methods, interfaces, composition over inheritance.

            ### 2. Core Data Structures
            - Slice, map, channel behaviors and boundaries.

            ### 3. Concurrency Model
            - Goroutine scheduling, channel patterns, locks, concurrency safety.

            ### 4. Control Flow & Errors
            - defer execution, panic/recover, explicit error returns.

            ### 5. Performance Foundations
            - GC, escape analysis, memory allocation, profiling strategies.
            """
        ),
    },
    {
        "key": "algorithms",
        "name": "Data Structures & Algorithms",
        "icon": "Code",
        "dir": "05_Algorithms",
        "readme": dedent(
            """\
            # Data Structures & Algorithms

            ## Most Frequently Tested
            - Arrays, Linked Lists, Stacks, Queues, Hash Tables, Trees, Heaps, Graphs, Sorting, Binary Search, DFS/BFS, Dynamic Programming.
            - Focus is not just on writing code, but on complexity analysis and modeling.

            ## Common Follow-up Questions
            - Why select this data structure? Can we do it faster or with less memory?
            - How to convert between recursion and iteration? How to handle edge cases?
            - Can this problem be abstracted into sliding window, two pointers, backtracking, DP, or greedy models?

            ## Core Knowledge Boundaries
            ### 1. Complexity
            - Time complexity, space complexity, amortized analysis.

            ### 2. Basic Structures
            - Linear structures, hash structures, trees, heaps, graphs and their operations.

            ### 3. Classic Algorithms
            - Sorting, searching, traversal, shortest path, topological sort.

            ### 4. Common Design Patterns
            - Two pointers, sliding window, recursion/backtracking, greedy, dynamic programming.

            ### 5. Interview Communication
            - Explain approach first, analyze complexity, then cover edge cases and optimizations.
            """
        ),
    },
    {
        "key": "sql",
        "name": "SQL",
        "icon": "Database",
        "dir": "06_SQL",
        "readme": dedent(
            """\
            # SQL

            ## Most Frequently Tested
            - join, aggregations, subqueries, window functions, indexes, transactions, locking, pagination, execution plans.
            - Interviews often connect SQL queries with database performance and concurrency.

            ## Common Follow-up Questions
            - Why is this SQL query slow? Why is the index not being used?
            - Cost differences between various join types, aggregations, sorting, and pagination.
            - Understanding transaction isolation levels, phantom reads, deadlocks, and locking scopes.

            ## Core Knowledge Boundaries
            ### 1. Query Basics
            - Filtering, sorting, grouping, aggregations, joins, subqueries.

            ### 2. Advanced Queries
            - Window functions, CTEs, deduplication, statistics.

            ### 3. Index & Execution Plan
            - Index structures, covering index, leftmost prefix, table scan lookup, Explain.

            ### 4. Transactions & Concurrency
            - ACID, isolation levels, locks, MVCC, deadlocks.

            ### 5. Optimization Strategies
            - Query rewriting, index design, pagination strategies, cold/hot data separation.
            """
        ),
    },
    {
        "key": "react",
        "name": "React",
        "icon": "Blocks",
        "dir": "07_React",
        "readme": dedent(
            """\
            # React

            ## Most Frequently Tested
            - Component communication, state management, Hooks, useEffect, rendering mechanism, key prop, performance optimization.
            - Interviews often move from basic page design to why components render the way they do.

            ## Common Follow-up Questions
            - Why does useEffect run repeatedly? Common pitfalls with dependency arrays and closures.
            - Why are state updates batch/asynchronous? Difference between render and commit phases.
            - How to avoid redundant rendering, mismatched state, and component side-effect leaks.

            ## Core Knowledge Boundaries
            ### 1. Component Basics
            - JSX, Props, State, controlled/uncontrolled components, conditional & list rendering.

            ### 2. Hooks
            - useState, useEffect, useRef, useContext responsibilities.

            ### 3. Rendering Mechanism
            - Triggers for component re-rendering, key prop usage, reconciliation, batch updates.

            ### 4. State Management
            - Local state, Context, lifting state up, splitting shared state.

            ### 5. Frontend Architecture
            - Component design, performance profiling, request & side-effect management, form handling.
            """
        ),
    },
    {
        "key": "spring",
        "name": "Spring",
        "icon": "Layers",
        "dir": "08_Spring",
        "readme": dedent(
            """\
            # Spring

            ## Most Frequently Tested
            - IoC, AOP, Bean lifecycle, Transactions, MVC, Autowiring, Proxy mechanisms.
            - The focus is on how the framework works internally rather than just annotations.

            ## Common Follow-up Questions
            - How dependency injection works; when Beans are instantiated and managed.
            - Why AOP and transactions rely on proxies; why transactions sometimes fail to rollback.
            - How Spring Boot auto-configuration works; how a request enters a controller.

            ## Core Knowledge Boundaries
            ### 1. IoC Container
            - BeanDefinition, dependency injection, Bean lifecycle, scopes.

            ### 2. AOP & Proxies
            - Dynamic proxies, aspects, advice, transaction interception.

            ### 3. Web Framework
            - Spring MVC request execution flow, parameter binding, exception handling.

            ### 4. Transactions
            - Propagation behavior, isolation levels, rollback rules, failure scenarios.

            ### 5. Boot Ecosystem
            - Auto-configuration, Starters, configuration binding, integration practices.
            """
        ),
    },
    {
        "key": "rag",
        "name": "RAG",
        "icon": "Library",
        "dir": "09_RAG",
        "readme": dedent(
            """\
            # RAG

            ## Most Frequently Tested
            - Document chunking, Embedding, Vector retrieval, Hybrid search, Reranking, Context assembly, Evaluation.
            - Focus is on "why retrieval fails" and "why answers are inconsistent".

            ## Common Follow-up Questions
            - How to split chunks; consequences of chunks being too large or too small.
            - What problems do vector search, keyword search, and reranking solve respectively.
            - How to control hallucinations, context length, freshness, and LLM costs.

            ## Core Knowledge Boundaries
            ### 1. Basic Pipeline
            - Data parsing, chunking, indexing, retrieval, reranking, generation, citations.

            ### 2. Retrieval Strategy
            - Vector search, BM25, hybrid search, filtering, query rewriting.

            ### 3. Context Construction
            - Chunk selection, deduplication, sorting, prompt constraint, citation strategy.

            ### 4. Quality Evaluation
            - Recall, relevance, correctness, latency, cost.

            ### 5. Production Issues
            - Data synchronization, caching, access control, tracing.
            """
        ),
    },
    {
        "key": "agent",
        "name": "Agent",
        "icon": "Bot",
        "dir": "10_Agent",
        "readme": dedent(
            """\
            # Agent

            ## Most Frequently Tested
            - Tool call, planning, state management, memory, workflows, retries, guardrails, evaluation.
            - Interviews focus on "why use an Agent instead of a standard workflow/pipeline".

            ## Common Follow-up Questions
            - When to use single Agent vs multi-Agent vs structured workflow orchestration.
            - How to handle tool access controls, retry failures, and idempotency.
            - What to store in memory; how to avoid context window overflow/pollution.

            ## Core Knowledge Boundaries
            ### 1. Core Concepts
            - Difference between Agent and workflow, tool calling, planner/executor.

            ### 2. Tool & Execution
            - Tool descriptions, parameter validation, feedback loop, error recovery.

            ### 3. State & Memory
            - Short-term state, long-term memory, retrieval-based memory, summarized memory.

            ### 4. Safety & Control
            - Authorization bounds, human-in-the-loop, guardrails, auditing, cost bounds.

            ### 5. Evaluation & Monitoring
            - Success rate, task completion, trace analysis, failure categorization.
            """
        ),
    },
    {
        "key": "middleware_distributed",
        "name": "Middleware & Distributed Systems",
        "icon": "Network",
        "dir": "11_Middleware_Distributed",
        "readme": dedent(
            """\
            # Middleware & Distributed Systems

            ## Most Frequently Tested
            - Redis, Message Queues, Distributed Lock, Cache Consistency, Rate Limiting, Circuit Breaker, CAP, Idempotency, Distributed Transactions.
            - Interviews focus on "high concurrency, high availability, and consistency".

            ## Common Follow-up Questions
            - How to handle cache penetration, breakdown, and avalanche; why choose those solutions.
            - Why introduce Message Queues; how to handle duplicate consumer, message ordering, and message loss.
            - How to design idempotency, degradation, isolation, retry, and fault recovery in distributed systems.

            ## Core Knowledge Boundaries
            ### 1. Caching
            - Redis data structures, expiration policies, eviction policies, cache-DB consistency.

            ### 2. Message Queues
            - Publisher-subscriber model, traffic shaving, ordering, retries, DLQ, idempotency.

            ### 3. Distributed Basics
            - CAP theorem, BASE properties, replication, leader election, split-brain.

            ### 4. High Availability
            - Rate limiting, circuit breaking, fallback, isolation, timeouts, retries.

            ### 5. Consistency
            - Distributed locking, distributed transactions, eventual consistency, compensation.
            """
        ),
    },
    {
        "key": "microservices",
        "name": "Microservices",
        "icon": "Workflow",
        "dir": "12_Microservices",
        "readme": dedent(
            """\
            # Microservices

            ## Most Frequently Tested
            - Service decomposition, Service discovery, Config center, API gateway, Distributed tracing, Fault tolerance, Blue-green deployment, Data consistency.
            - Focus is on "why split, how to split, and service governance after split".

            ## Common Follow-up Questions
            - Why break down a monolith? What boundaries to use? Drawbacks of over-splitting.
            - How service-to-service calls handle timeout, retries, breaking, rate limiting, and tracing.
            - How to manage data consistency, deployment overhead, and troubleshooting costs.

            ## Core Knowledge Boundaries
            ### 1. Decomposition Principles
            - Business domains, team structure, database boundaries, evolutionary splitting.

            ### 2. Infrastructure
            - Service registry & discovery, configuration management, API gateway, service communication.

            ### 3. Service Governance
            - Load balancing, circuit breaker, retries, rate limiting, fallback, observability.

            ### 4. Data & Transactions
            - Database partitioning, service data boundaries, eventual consistency, Saga/Compensation.

            ### 5. Delivery & Ops
            - Canary deployment, rollbacks, logs, metrics, tracing, troubleshooting.
            """
        ),
    },
]


def _read_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def _write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _state_path(user_id: str):
    return settings.user_data_dir(user_id) / ".preset_topics_state.json"


def _should_seed_readme(readme_path, topic_name: str) -> bool:
    if not readme_path.exists():
        return True

    content = readme_path.read_text(encoding="utf-8").strip()
    return content in {"", f"# {topic_name}"}


def ensure_preset_topics(user_id: str):
    topics_path = settings.user_topics_path(user_id)
    topics = _read_json(topics_path, {})
    state = _read_json(_state_path(user_id), {"seeded_keys": []})
    seeded_keys = set(state.get("seeded_keys", []))

    topics_changed = False
    state_changed = False

    for preset in PRESET_TOPICS:
        key = preset["key"]
        existing = topics.get(key)

        if key not in seeded_keys and existing is None:
            existing = {
                "name": preset["name"],
                "icon": preset["icon"],
                "dir": preset["dir"],
            }
            topics[key] = existing
            topics_changed = True

        if key not in seeded_keys:
            topic_meta = existing or {
                "name": preset["name"],
                "icon": preset["icon"],
                "dir": preset["dir"],
            }
            topic_dir = settings.user_knowledge_path(user_id) / topic_meta["dir"]
            topic_dir.mkdir(parents=True, exist_ok=True)
            readme_path = topic_dir / "README.md"

            if _should_seed_readme(readme_path, topic_meta.get("name") or preset["name"]):
                readme_path.write_text(preset["readme"], encoding="utf-8")

            seeded_keys.add(key)
            state_changed = True

    if topics_changed:
        _write_json(topics_path, topics)
    if state_changed:
        _write_json(_state_path(user_id), {"seeded_keys": sorted(seeded_keys)})
