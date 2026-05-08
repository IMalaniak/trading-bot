workspace "Trading Bot System" {

    !identifiers hierarchical

    model {
        trader = person "Trader" "User who monitors and configures the trading bot."
        operator = person "Operator" "Engineer who monitors metrics, drains DLQs, and runs replay/recovery workflows."
        prometheus = softwareSystem "Prometheus" "Planned metrics scraper for service /metrics endpoints." "External" {
            tags "Planned"
        }

        tradingBot = softwareSystem "Trading Bot" "An automated trading system with ML-based predictions and execution." {

            // Containers

            group "Data Ingestion Service" {
                dataIngestion = container "Data Ingestion" "Subscribes to market data topics, stores raw/indicator time-series data, and manages stream subscriptions." "Rust" {
                    tags "Planned"
                    gRPC = component "Market Data API" "Exposes gRPC API for API Gateway to fetch historical data." "gRPC" "API"
                    gRPC_Client = component "gRPC Client" "Handles internal service-to-service communication." "gRPC"

                    core = component "Ingestion Core" "Main logic for managing data ingestion and stream subscription orchestration." "Rust"
                    marketCollector = component "Market Data Collector" "Orchestrates market stream subscriptions via External API Facade." "Rust"
                    repository = component "Data Ingestion Repository" "Reads/Writes data from/to TimescaleDB." "Rust"

                    kafkaConsumer = component "Kafka Consumer" "Consumes instrument registration, raw market data, and engineered indicator topics from Kafka." "Rust"

                    gRPC -> core "Handles market data requests via"
                    core -> marketCollector "Controls subscription feeds of"
                    core -> repository "Reads historical data and writes raw/indicator series via"
                    core -> kafkaConsumer "Subscribes to instrument registration and market topics via"
                    marketCollector -> gRPC_Client "Communicates with External API Facade over"

                }

                timescale = container "Market Data Store" "Owned by Data Ingestion. Stores historical market/trading data." "TimescaleDB" "Datastore" {
                    tags "Implemented"
                }
            }

            group "Feature Engineering Service" {
                featureEngineering = container "Feature Engineering" "Computes indicators and transforms raw data for prediction." "Rust" {
                    tags "Planned"
                    featureCalculator = component "Feature Calculator" "Computes indicators (RSI, MACD, volatility, correlations)." "Rust"

                    kafkaConsumer = component "Kafka Consumer" "Consumes raw market data from Kafka." "Rust"
                    kafkaPublisher = component "Kafka Publisher" "Publishes engineered features to Kafka." "Rust"

                    kafkaConsumer -> featureCalculator "Feeds raw events to"
                    featureCalculator -> kafkaPublisher "Publishes features to"

                }
            }

            group "Prediction Engine Service" {
                predictionEngine = container "Prediction Engine" "Runs ML/NLP models to generate trading signals. Owns Signal Cache." "Python" {
                    tags "Planned"
                    gRPC = component "Signal API" "Exposes signals and recommendations gRPC API to API Gateway." "gRPC" "API"

                    apiService = component "API Service" "Handles gRPC requests for current signals and recommendations." "Python"
                    modelRunner = component "Model Runner" "Runs ML models (LSTMs, Transformers, RL)." "Python"
                    newsAnalyzer = component "Newsfeed Analyzer" "Processes sentiment / news / social data and produces features." "Python"
                    signalCacheManager = component "Signal Cache Manager" "Manages Redis cache: deduplicates signals and keeps short-term history for fast internal retrieval." "Python"

                    kafkaConsumer = component "Kafka Consumer" "Consumes engineered features from Kafka." "Python"
                    kafkaPublisher = component "Kafka Publisher" "Publishes signals to Kafka." "Python"

                    gRPC -> apiService "Handles signal requests via"
                    apiService -> signalCacheManager "Fetches latest signals via"
                    kafkaConsumer -> modelRunner "Feeds features into"
                    modelRunner -> kafkaPublisher "Publishes predicted signals to"
                    modelRunner -> signalCacheManager "Caches inference output in"

                    newsAnalyzer -> modelRunner "Provides sentiment & news features to"
                }
            }

            group "Risk & Portfolio Manager Service" {
                portfolioManager = container "Risk & Portfolio Manager" "Implements instrument registration, the current two-stage risk pipeline, fill reconciliation, exposure state, and portfolio update publishing today." "Nest.js" {
                    tags "Implemented"
                    gRPC = component "Risk & Portfolio API" "Exposes instrument registration, portfolio read queries, and instrument resolution today; remains the planned gRPC surface for broader risk/strategy configuration workflows." "gRPC" "API"

                    riskRules = component "Risk Rules Engine" "Applies the current deterministic portfolio-stage checks in order, using exact decimals: subscription enabled, per-trade cap, per-instrument reserved exposure cap, then per-portfolio reserved exposure cap." "TypeScript" {
                        tags "Implemented"
                    }
                    strategyConfigManager = component "Strategy Config Manager" "Receives strategy updates and start/stop commands from API Gateway and manages rule sets." "TypeScript" {
                        tags "Planned"
                    }
                    portfolioManager = component "Portfolio Manager" "Handles instrument registration and portfolio-facing workflows inside the service." "TypeScript" {
                        tags "Implemented"
                    }
                    portfolioQueryService = component "Portfolio Query Service" "Reads portfolio summary exposure state, open positions, and instrument summaries for API Gateway visibility requests." "TypeScript" {
                        tags "Implemented"
                    }
                    instrumentStageService = component "Instrument Stage Service" "Deduplicates source signals, validates instruments, loads active portfolio-instrument configs including disabled subscriptions, snapshots target notional, and fans one source signal out into portfolio candidates." "TypeScript" {
                        tags "Implemented"
                    }
                    portfolioStageService = component "Portfolio Stage Service" "Loads portfolio candidates, sizes requested trades with exact decimals, evaluates rules, persists decisions and reservations, and emits final trade decisions." "TypeScript" {
                        tags "Implemented"
                    }
                    tradeSizingService = component "Trade Sizing Service" "Derives requested notional and quantity from portfolio configuration and the signal reference price." "TypeScript" {
                        tags "Implemented"
                    }
                    riskConfigRepository = component "Risk Config Repository" "Loads active portfolio-instrument configs, enablement flags, and exact exposure caps from PostgreSQL." "TypeScript" {
                        tags "Implemented"
                    }
                    riskStateRepository = component "Risk State Repository" "Persists instruments, outbox rows, signal receipts, candidate audit rows, risk decisions, and exposure reservations into PostgreSQL." "TypeScript" {
                        tags "Implemented"
                    }
                    portfolioStateRepository = component "Portfolio State Repository" "Persists reconciled orders, fills, signed net positions, and portfolio summary snapshots into PostgreSQL." "TypeScript" {
                        tags "Implemented"
                    }
                    outboxDispatcher = component "Outbox Dispatcher" "Uses the shared Kafka outbox dispatcher core with a portfolio-owned Prisma repository adapter." "TypeScript" {
                        tags "Implemented"
                    }
                    metricsEndpoint = component "Metrics Endpoint" "Exposes Prometheus metrics for Kafka consumer outcomes, retries, DLQ writes, outbox dispatch outcomes, backlog, and oldest pending age." "HTTP /metrics" {
                        tags "Implemented"
                    }
                    instrumentStageConsumer = component "Instrument Stage Consumer" "Consumes trading.signals keyed by instrument_key." "TypeScript" {
                        tags "Implemented"
                    }
                    portfolioStageConsumer = component "Portfolio Stage Consumer" "Consumes trading.signals.portfolio keyed by portfolio_key." "TypeScript" {
                        tags "Implemented"
                    }
                    fillReconciliationConsumer = component "Fill Reconciliation Consumer" "Consumes orders.fills keyed by portfolio_key and reads fill event-id headers." "TypeScript" {
                        tags "Implemented"
                    }
                    consumerReliabilityWrapper = component "Consumer Reliability Wrapper" "Wraps implemented Kafka consumers with bounded retry, structured context logging, DLQ publishing, and offset commits after handler success or DLQ success." "TypeScript" {
                        tags "Implemented"
                    }
                    dlqPublisher = component "DLQ Publisher" "Publishes DeadLetterEvent protobuf envelopes to per-topic DLQs while preserving the original Kafka key." "TypeScript" {
                        tags "Implemented"
                    }
                    fillReconciliationService = component "Fill Reconciliation Service" "Deduplicates fills, upserts portfolio-owned order/fill state, recalculates signed net positions and aggregate exposure, releases completed reservations, and enqueues portfolio.updated." "TypeScript" {
                        tags "Implemented"
                    }
                    executionUpdatesConsumer = component "Orders Placed Consumer" "Planned consumer for orders.placed lifecycle updates; orders.placed is not consumed in Iteration 4." "TypeScript" {
                        tags "Planned"
                    }
                    kafkaPublisher = component "Kafka Publisher" "Publishes instrument.registered, trading.signals.portfolio, trades.approved/trades.rejected, and portfolio.updated today." "TypeScript" {
                        tags "Implemented"
                    }

                    gRPC -> strategyConfigManager "Handles planned risk/strategy config updates via"
                    gRPC -> portfolioManager "Handles instrument registration via"
                    gRPC -> portfolioQueryService "Handles portfolio read and instrument resolution requests via"
                    portfolioQueryService -> portfolioStateRepository "Reads summary, positions, orders/fills-derived state, and instruments via"
                    instrumentStageConsumer -> instrumentStageService "Feeds trading.signals into"
                    instrumentStageConsumer -> consumerReliabilityWrapper "Processes messages through"
                    instrumentStageService -> riskConfigRepository "Loads active portfolio configs from"
                    instrumentStageService -> riskStateRepository "Writes signal receipts, candidate rows, and outbox rows via"
                    instrumentStageService -> kafkaPublisher "Publishes trading.signals.portfolio via outbox"
                    portfolioStageConsumer -> portfolioStageService "Feeds trading.signals.portfolio into"
                    portfolioStageConsumer -> consumerReliabilityWrapper "Processes messages through"
                    portfolioStageService -> tradeSizingService "Derives requested size via"
                    portfolioStageService -> riskRules "Evaluates candidates against"
                    portfolioStageService -> riskConfigRepository "Loads portfolio caps from"
                    portfolioStageService -> riskStateRepository "Writes decisions, reservations, and outbox rows via"
                    portfolioStageService -> kafkaPublisher "Publishes trades.approved and trades.rejected via outbox"
                    fillReconciliationConsumer -> fillReconciliationService "Feeds orders.fills into"
                    fillReconciliationConsumer -> consumerReliabilityWrapper "Processes messages through"
                    consumerReliabilityWrapper -> dlqPublisher "Sends exhausted failures to"
                    consumerReliabilityWrapper -> metricsEndpoint "Records consumer retry and DLQ metrics via"
                    fillReconciliationService -> portfolioStateRepository "Writes orders, fills, positions, snapshots, and reservation releases via"
                    fillReconciliationService -> kafkaPublisher "Publishes portfolio.updated via outbox"
                    executionUpdatesConsumer -> portfolioManager "Will feed orders.placed updates into"
                    strategyConfigManager -> riskRules "Provides rule updates to"
                    riskRules -> riskStateRepository "Logs risk decisions via"
                    portfolioManager -> riskStateRepository "Persists instrument state and outbox rows via"
                    outboxDispatcher -> riskStateRepository "Claims outbox rows from"
                    outboxDispatcher -> kafkaPublisher "Publishes claimed outbox rows via"
                    outboxDispatcher -> metricsEndpoint "Records dispatch and backlog metrics via"
                }

                postgres = container "Portfolio DB" "Stores instruments, outbox rows, portfolios, signal receipts, candidate audit rows, risk decisions, exposure reservations, reconciled orders/fills, signed positions, and summary snapshots today; later it can also store users and trade history." "PostgreSQL" "Datastore" {
                    tags "Implemented"
                }

            }

            group "Execution Engine Service" {
                executionEngine = container "Execution Engine" "Consumes approved trades today and simulates deterministic order placement/fills; real exchange execution remains planned." "Nest.js" {
                    tags "Implemented"
                    gRPC = component "Execution Read API" "Exposes execution-owned recent order/fill read queries for API Gateway visibility requests." "gRPC" "API" {
                        tags "Implemented"
                    }
                    gRPC_Client = component "gRPC Client" "Planned internal communication with External API Facade for real order placement." "gRPC" {
                        tags "Planned"
                    }

                    approvedTradesConsumer = component "Approved Trades Consumer" "Consumes trades.approved keyed by portfolio_key and reads approval event-id headers." "TypeScript" {
                        tags "Implemented"
                    }
                    consumerReliabilityWrapper = component "Consumer Reliability Wrapper" "Wraps the approved-trades Kafka consumer with bounded retry, structured context logging, DLQ publishing, and offset commits after handler success or DLQ success." "TypeScript" {
                        tags "Implemented"
                    }
                    dlqPublisher = component "DLQ Publisher" "Publishes DeadLetterEvent protobuf envelopes to trades.approved.dlq while preserving the original Kafka key." "TypeScript" {
                        tags "Implemented"
                    }
                    simulatorCore = component "Execution Simulator Core" "Builds deterministic order IDs, placed events, one partial fill, and one final fill from approved trades." "TypeScript" {
                        tags "Implemented"
                    }
                    executionStateRepository = component "Execution State Repository" "Persists simulated orders, fills, and idempotency identities into the execution-owned PostgreSQL schema." "TypeScript" {
                        tags "Implemented"
                    }
                    executionQueryService = component "Execution Query Service" "Reads recent portfolio execution orders with nested fills, ordered by latest lifecycle activity." "TypeScript" {
                        tags "Implemented"
                    }
                    outboxDispatcher = component "Outbox Dispatcher" "Uses the shared Kafka outbox dispatcher core with an execution-owned Prisma repository adapter and lifecycle ordering." "TypeScript" {
                        tags "Implemented"
                    }
                    metricsEndpoint = component "Metrics Endpoint" "Exposes Prometheus metrics for Kafka consumer outcomes, retries, DLQ writes, outbox dispatch outcomes, backlog, and oldest pending age." "HTTP /metrics" {
                        tags "Implemented"
                    }
                    kafkaPublisher = component "Kafka Publisher" "Publishes orders.placed and orders.fills execution updates to Kafka." "TypeScript" {
                        tags "Implemented"
                    }
                    tradeExecutor = component "Trade Executor" "Planned real exchange order executor." "TypeScript" {
                        tags "Planned"
                    }

                    approvedTradesConsumer -> simulatorCore "Feeds approved trade decisions to"
                    approvedTradesConsumer -> consumerReliabilityWrapper "Processes messages through"
                    consumerReliabilityWrapper -> dlqPublisher "Sends exhausted failures to"
                    consumerReliabilityWrapper -> metricsEndpoint "Records consumer retry and DLQ metrics via"
                    simulatorCore -> executionStateRepository "Writes orders, fills, and outbox rows via"
                    gRPC -> executionQueryService "Handles recent execution order read requests via"
                    executionQueryService -> executionStateRepository "Reads orders and fills from"
                    outboxDispatcher -> executionStateRepository "Claims outbox rows from"
                    outboxDispatcher -> kafkaPublisher "Publishes claimed lifecycle events via"
                    outboxDispatcher -> metricsEndpoint "Records dispatch and backlog metrics via"
                    tradeExecutor -> gRPC_Client "Will communicate with External API Facade over"
                }

                executionPostgres = container "Execution DB" "Owned by Execution Engine. Stores simulated orders, fills, and execution outbox rows in an execution-owned PostgreSQL schema." "PostgreSQL" "Datastore" {
                    tags "Implemented"
                }
            }

            group "API Gateway Service" {
                apiGateway = container "API Gateway" "Routes instrument registration today and is the planned coordination layer for broader dashboard-facing workflows." "Nest.js" {
                    tags "Implemented"
                    REST = component "API" "Exposes instrument registration today and will later expand to strategy, portfolio, and market-data endpoints." "REST" "API"
                    gRPC_Client = component "gRPC Client" "Handles internal service-to-service communication." "gRPC"

                    core = component "Core Orchestration" "Coordinates the current registration workflow and portfolio visibility aggregation." "TypeScript"

                    marketDataProxy = component "Market Data Proxy" "Forwards dashboard queries to Data Ingestion (Market Data API)." "TypeScript"
                    portfolioProxy = component "Portfolio Proxy" "Forwards instrument registration, portfolio reads, and instrument resolution to Risk & Portfolio Manager." "TypeScript"
                    executionProxy = component "Execution Proxy" "Fetches recent execution-owned orders and fills from Execution Engine." "TypeScript" {
                        tags "Implemented"
                    }
                    portfolioReadAggregator = component "Portfolio Read Aggregator" "Combines portfolio state with recent execution orders into the REST portfolio visibility response." "TypeScript" {
                        tags "Implemented"
                    }
                    metricsEndpoint = component "Metrics Endpoint" "Exposes API Gateway Prometheus metrics on GET /metrics outside the /api prefix." "HTTP /metrics" {
                        tags "Implemented"
                    }
                    signalProxy = component "Signal Proxy" "Forwards dashboard queries to Prediction Engine (Signal API)." "TypeScript"
                    riskProxy = component "Risk Proxy" "Forwards strategy/risk config updates to Risk & Portfolio Manager (Risk API)." "TypeScript"

                    REST -> core "Handles API requests via"
                    core -> marketDataProxy "Sends market data requests to"
                    core -> portfolioProxy "Sends instrument registration, portfolio reads, and instrument resolution requests to"
                    core -> portfolioReadAggregator "Builds portfolio visibility responses via"
                    core -> metricsEndpoint "Exposes operational metrics via"
                    portfolioReadAggregator -> portfolioProxy "Reads portfolio summary, positions, and instruments via"
                    portfolioReadAggregator -> executionProxy "Reads recent execution orders via"
                    core -> signalProxy "Sends signal requests to"
                    core -> riskProxy "Forwards strategy/risk config updates AND start/stop trading commands to"
                    marketDataProxy -> gRPC_Client "Communicates with Data Ingestion over gRPC"
                    portfolioProxy -> gRPC_Client "Communicates with Risk & Portfolio Manager over gRPC"
                    executionProxy -> gRPC_Client "Communicates with Execution Engine over gRPC"
                    signalProxy -> gRPC_Client "Communicates with Prediction Engine over gRPC"
                    riskProxy -> gRPC_Client "Communicates with Risk & Portfolio Manager over gRPC"
                }
            }
            
            externalAPIFacade = container "External API Facade" "Handles external API integrations (e.g., Binance)." "Nest.js" {
                tags "Planned"
                gRPC = component "External Facade API" "Exposes gRPC API for internal services to interact with external exchanges." "gRPC" "API"

                core = component "Facade Core" "Manages connections and interactions with external exchange APIs." "TypeScript"
                binanceClient = component "Binance Client" "Handles REST and WebSocket connections to Binance API." "TypeScript"
                kafkaPublisher = component "Kafka Publisher" "Publishes market data to Kafka." "TypeScript"

                core -> kafkaPublisher "Publishes raw data to"
                gRPC -> core "Handles external API requests via"
                core -> binanceClient "Sends requests to Binance via"
            }

            dashboard = container "Dashboard" "React" "User interface for monitoring and controlling the bot." "Single Page Application" {
                tags "Planned"
                router = component "Router" "Handles navigation and routing between UI components." "TypeScript/React"
                strategyConfigUI = component "Strategy Config UI" "Lets user define/edit strategy preferences." "TypeScript/React"
                portfolioUI = component "Portfolio View" "Displays portfolio balances, positions, trades." "TypeScript/React"
                marketChartsUI = component "Market Charts" "Visualizes market data and indicators." "TypeScript/React"
                signalMonitorUI = component "Signal Monitor" "Shows buy/sell signals and recommendations." "TypeScript/React"
                controlPanelUI = component "Control Panel" "Allows toggling risk modes, start/stop trading." "TypeScript/React"

                apiClient = component "API Client" "REST client for communicating with API Gateway." "REST"

                router -> controlPanelUI "Routes starts/stops trading actions via"
                router -> strategyConfigUI "Routes strategy preferences configuration via"
                router -> portfolioUI "Routes portfolio and trade history views via"
                router -> marketChartsUI "Routes market data and indicators views via"
                router -> signalMonitorUI "Routes buy/sell signals views via"

                controlPanelUI -> apiClient "Sends start/stop commands via"
                strategyConfigUI -> apiClient "Sends strategy config updates via"
                portfolioUI -> apiClient "Fetches portfolio and trade history via"
                marketChartsUI -> apiClient "Fetches market data and indicators via"
                signalMonitorUI -> apiClient "Fetches latest signals via"

            }

            // Databases (each owned/isolated to one service)
            redis = container "Signal Cache" "Owned by Prediction Engine. Stores recent signals for fast access." "Redis" "Datastore" {
                tags "Planned"
            }

            // Message bus
            messageBus = container "Message Bus" "Event-driven communication and streaming backbone. Local development uses Redpanda with the Kafka API." "Apache Kafka" "Queue" {
                tags "Implemented"
            }
            schemaRegistry = container "Schema Registry" "Kafka schema registry for event contracts and versioning." "Schema Registry" "Service" {
                tags "Planned"
            }

            // ML training pipeline placeholder (out of scope for now)
            modelRegistry = container "Model Registry" "Stores versioned ML models for deployment." "Registry" "Service" {
                tags "Planned"
            }
            trainingPipeline = container "Model Training Pipeline" "Offline training/evaluation pipeline (placeholder)." "Batch/ML" "Service" {
                tags "Planned"
            }
        }

        // External systems
        group "External Systems" {
            binance = softwareSystem "Binance API" "External exchange providing market data and accepting trade orders." "External"
        }

        // Container-level relationships
        trader -> tradingBot.dashboard.router "Monitors portfolio and configures strategies"
        operator -> tradingBot.messageBus "Inspects DLQ topics and replays repaired events"
        operator -> tradingBot.portfolioManager.metricsEndpoint "Inspects portfolio-manager metrics"
        operator -> tradingBot.executionEngine.metricsEndpoint "Inspects execution-engine metrics"
        operator -> tradingBot.apiGateway.metricsEndpoint "Inspects API Gateway metrics"
        prometheus -> tradingBot.portfolioManager.metricsEndpoint "Will scrape metrics from"
        prometheus -> tradingBot.executionEngine.metricsEndpoint "Will scrape metrics from"
        prometheus -> tradingBot.apiGateway.metricsEndpoint "Will scrape metrics from"

        tradingBot.dashboard.apiClient -> tradingBot.apiGateway.REST "Sends API requests (UI)"
        tradingBot.apiGateway.gRPC_Client -> tradingBot.dataIngestion.gRPC "Requests market data and subscription updates (Market Data API)"
        tradingBot.apiGateway.gRPC_Client -> tradingBot.predictionEngine.gRPC "Requests current signals / triggers (Signal API)"
        tradingBot.apiGateway.gRPC_Client -> tradingBot.portfolioManager.gRPC "Registers instruments, reads portfolio state, resolves instruments, and later sends risk/strategy updates"
        tradingBot.apiGateway.gRPC_Client -> tradingBot.executionEngine.gRPC "Reads recent execution orders and fills"
        
        tradingBot.dataIngestion.repository -> tradingBot.timescale "Writes historical market data to"

        tradingBot.externalAPIFacade.kafkaPublisher -> tradingBot.messageBus "Publishes market.raw.data to"
        tradingBot.featureEngineering.kafkaPublisher -> tradingBot.messageBus "Publishes features.indicators to"
        tradingBot.predictionEngine.kafkaPublisher -> tradingBot.messageBus "Publishes trading.signals to"
        tradingBot.portfolioManager.kafkaPublisher -> tradingBot.messageBus "Publishes instrument.registered to"
        tradingBot.portfolioManager.kafkaPublisher -> tradingBot.messageBus "Publishes trading.signals.portfolio to"
        tradingBot.portfolioManager.kafkaPublisher -> tradingBot.messageBus "Publishes trades.approved and trades.rejected to"
        tradingBot.portfolioManager.kafkaPublisher -> tradingBot.messageBus "Publishes portfolio.updated to"
        tradingBot.portfolioManager.dlqPublisher -> tradingBot.messageBus "Publishes trading.signals.dlq, trading.signals.portfolio.dlq, and orders.fills.dlq to"
        tradingBot.executionEngine.kafkaPublisher -> tradingBot.messageBus "Publishes orders.placed and orders.fills to"
        tradingBot.executionEngine.dlqPublisher -> tradingBot.messageBus "Publishes trades.approved.dlq to"

        tradingBot.dataIngestion.kafkaConsumer -> tradingBot.messageBus "Consumes instrument.registered, market.raw.data, and features.indicators from"
        tradingBot.featureEngineering.kafkaConsumer -> tradingBot.messageBus "Consumes market.raw.data from"
        tradingBot.predictionEngine.kafkaConsumer -> tradingBot.messageBus "Consumes features.indicators from"
        tradingBot.portfolioManager.instrumentStageConsumer -> tradingBot.messageBus "Consumes trading.signals from"
        tradingBot.portfolioManager.portfolioStageConsumer -> tradingBot.messageBus "Consumes trading.signals.portfolio from"
        tradingBot.portfolioManager.fillReconciliationConsumer -> tradingBot.messageBus "Consumes orders.fills from"
        tradingBot.portfolioManager.executionUpdatesConsumer -> tradingBot.messageBus "Will consume orders.placed from"
        tradingBot.executionEngine.approvedTradesConsumer -> tradingBot.messageBus "Consumes trades.approved from"

        tradingBot.predictionEngine.signalCacheManager -> tradingBot.redis "Writes recent signals to"

        tradingBot.portfolioManager.riskConfigRepository -> tradingBot.postgres "Reads portfolio subscriptions and caps from"
        tradingBot.portfolioManager.riskStateRepository -> tradingBot.postgres "Writes instruments, audit state, decisions, reservations, and outbox rows to"
        tradingBot.portfolioManager.portfolioStateRepository -> tradingBot.postgres "Writes reconciled order, fill, position, and summary state to"
        tradingBot.portfolioManager.portfolioQueryService -> tradingBot.postgres "Reads portfolio visibility state and instruments from"

        tradingBot.executionEngine.executionStateRepository -> tradingBot.executionPostgres "Writes simulated orders, fills, and outbox rows to"
        tradingBot.executionEngine.executionQueryService -> tradingBot.executionPostgres "Reads recent execution orders and fills from"
        tradingBot.executionEngine.gRPC_Client -> tradingBot.externalAPIFacade.gRPC "Will place real orders on"
        tradingBot.dataIngestion.gRPC_Client -> tradingBot.externalAPIFacade.gRPC "Asks to start/stop fetching market data"
        tradingBot.externalAPIFacade.binanceClient -> binance "Places orders on"
        tradingBot.externalAPIFacade.binanceClient -> binance "Fetches market data from"

        tradingBot.messageBus -> tradingBot.schemaRegistry "Uses schemas from"
        tradingBot.predictionEngine.modelRunner -> tradingBot.modelRegistry "Loads versioned models from"
        tradingBot.trainingPipeline -> tradingBot.modelRegistry "Publishes trained models to"

    } /* end model */

    views {
        systemContext tradingBot "SystemContext" {
            include *
            autolayout lr
        }

        container tradingBot "ContainerView-TradingBot" {
            include *
            autolayout
        }

        // Component views for each container: explicitly include component IDs to be safe
        component tradingBot.dataIngestion "DataIngestion-Components" {
            include tradingBot.apiGateway.gRPC_Client
            include tradingBot.dataIngestion.core
            include tradingBot.dataIngestion.marketCollector
            include tradingBot.dataIngestion.gRPC
            include tradingBot.dataIngestion.gRPC_Client
            include tradingBot.dataIngestion.repository
            include tradingBot.dataIngestion.kafkaConsumer
            include tradingBot.timescale
            include tradingBot.messageBus
            include tradingBot.externalAPIFacade.gRPC
            autolayout lr
        }

        component tradingBot.featureEngineering "FeatureEngineering-Components" {
            include tradingBot.featureEngineering.kafkaConsumer
            include tradingBot.featureEngineering.featureCalculator
            include tradingBot.featureEngineering.kafkaPublisher
            include tradingBot.messageBus
            autolayout lr
        }

        component tradingBot.predictionEngine "PredictionEngine-Components" {
            include tradingBot.apiGateway.gRPC_Client
            include tradingBot.predictionEngine.apiService
            include tradingBot.predictionEngine.kafkaConsumer
            include tradingBot.predictionEngine.modelRunner
            include tradingBot.predictionEngine.newsAnalyzer
            include tradingBot.predictionEngine.signalCacheManager
            include tradingBot.predictionEngine.gRPC
            include tradingBot.predictionEngine.kafkaPublisher
            include tradingBot.redis
            include tradingBot.messageBus
            include tradingBot.modelRegistry
            autolayout lr
        }

        component tradingBot.portfolioManager "RiskManager-Components" {
            include tradingBot.apiGateway.gRPC_Client
            include tradingBot.portfolioManager.gRPC
            include tradingBot.portfolioManager.instrumentStageConsumer
            include tradingBot.portfolioManager.consumerReliabilityWrapper
            include tradingBot.portfolioManager.dlqPublisher
            include tradingBot.portfolioManager.instrumentStageService
            include tradingBot.portfolioManager.portfolioStageConsumer
            include tradingBot.portfolioManager.portfolioStageService
            include tradingBot.portfolioManager.fillReconciliationConsumer
            include tradingBot.portfolioManager.fillReconciliationService
            include tradingBot.portfolioManager.executionUpdatesConsumer
            include tradingBot.portfolioManager.riskRules
            include tradingBot.portfolioManager.tradeSizingService
            include tradingBot.portfolioManager.strategyConfigManager
            include tradingBot.portfolioManager.kafkaPublisher
            include tradingBot.portfolioManager.outboxDispatcher
            include tradingBot.portfolioManager.metricsEndpoint
            include tradingBot.portfolioManager.portfolioManager
            include tradingBot.portfolioManager.portfolioQueryService
            include tradingBot.portfolioManager.riskConfigRepository
            include tradingBot.portfolioManager.riskStateRepository
            include tradingBot.portfolioManager.portfolioStateRepository
            include tradingBot.postgres
            include tradingBot.messageBus
            include operator
            include prometheus
            autolayout lr
        }

        container tradingBot "Kafka-Containers" {
            include tradingBot.messageBus
            include tradingBot.schemaRegistry
            autolayout lr
        }

        component tradingBot.executionEngine "ExecutionEngine-Components" {
            include tradingBot.executionEngine.approvedTradesConsumer
            include tradingBot.executionEngine.consumerReliabilityWrapper
            include tradingBot.executionEngine.dlqPublisher
            include tradingBot.executionEngine.simulatorCore
            include tradingBot.executionEngine.executionStateRepository
            include tradingBot.executionEngine.executionQueryService
            include tradingBot.executionEngine.outboxDispatcher
            include tradingBot.executionEngine.metricsEndpoint
            include tradingBot.executionEngine.kafkaPublisher
            include tradingBot.executionEngine.tradeExecutor
            include tradingBot.executionEngine.gRPC
            include tradingBot.executionEngine.gRPC_Client
            include tradingBot.executionPostgres
            include tradingBot.messageBus
            include operator
            include prometheus
            include tradingBot.externalAPIFacade.gRPC
            autolayout lr
        }

        component tradingBot.apiGateway "APIGateway-Components" {
            include tradingBot.dashboard.apiClient
            include tradingBot.apiGateway.core
            include tradingBot.apiGateway.REST
            include tradingBot.apiGateway.gRPC_Client
            include tradingBot.apiGateway.marketDataProxy
            include tradingBot.apiGateway.portfolioProxy
            include tradingBot.apiGateway.executionProxy
            include tradingBot.apiGateway.portfolioReadAggregator
            include tradingBot.apiGateway.metricsEndpoint
            include tradingBot.apiGateway.signalProxy
            include tradingBot.apiGateway.riskProxy
            include tradingBot.dataIngestion.gRPC
            include tradingBot.predictionEngine.gRPC
            include tradingBot.portfolioManager.gRPC
            include tradingBot.executionEngine.gRPC
            include operator
            include prometheus
            autolayout lr
        }

        component tradingBot.dashboard "Dashboard-Components" {
            include trader
            include tradingBot.dashboard.router
            include tradingBot.dashboard.strategyConfigUI
            include tradingBot.dashboard.portfolioUI
            include tradingBot.dashboard.marketChartsUI
            include tradingBot.dashboard.signalMonitorUI
            include tradingBot.dashboard.controlPanelUI
            include tradingBot.dashboard.apiClient
            include tradingBot.apiGateway.REST
            autolayout lr
        }

        component tradingBot.externalAPIFacade "ExternalAPIFacade-Components" {
            include tradingBot.executionEngine.gRPC_Client
            include tradingBot.dataIngestion.gRPC_Client
            include tradingBot.externalAPIFacade.core
            include tradingBot.externalAPIFacade.gRPC
            include tradingBot.externalAPIFacade.binanceClient
            include tradingBot.externalAPIFacade.kafkaPublisher
            include tradingBot.messageBus
            include binance
            autolayout lr
        }

        theme default

        styles {
            element "Person" {
                shape Person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "External" {
                background #999999
                color #ffffff
            }
            element "Service" {
                shape roundedbox
            }
            element "Web Server" {
                shape folder
            }
            element "Single Page Application" {
                shape webbrowser
            }
            element "API" {
                shape hexagon
            }
            element "Datastore" {
                shape cylinder
            }
            element "Queue" {
                shape pipe
            }
            element "Implemented" {
                background #2d7d46
                color #ffffff
            }
            element "Planned" {
                background #b2b2b2
                color #111111
            }
        }
    }

}
