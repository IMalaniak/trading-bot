workspace "Trading Bot System" {

    !identifiers hierarchical

    model {
        trader = person "Trader" "User who monitors and configures the trading bot."

        tradingBot = softwareSystem "Trading Bot" "An automated trading system with ML-based predictions and execution." {

            // Containers

            group "Data Ingestion Service" {
                dataIngestion = container "Data Ingestion" "Subscribes to market data topics, stores raw/indicator time-series data, and manages stream subscriptions." "Rust" {
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

                timescale = container "Market Data Store" "Owned by Data Ingestion. Stores historical market/trading data." "TimescaleDB" "Datastore"
            }

            group "Feature Engineering Service" {
                featureEngineering = container "Feature Engineering" "Computes indicators and transforms raw data for prediction." "Rust" {
                    featureCalculator = component "Feature Calculator" "Computes indicators (RSI, MACD, volatility, correlations)." "Rust"

                    kafkaConsumer = component "Kafka Consumer" "Consumes raw market data from Kafka." "Rust"
                    kafkaPublisher = component "Kafka Publisher" "Publishes engineered features to Kafka." "Rust"

                    kafkaConsumer -> featureCalculator "Feeds raw events to"
                    featureCalculator -> kafkaPublisher "Publishes features to"

                }
            }

            group "Prediction Engine Service" {
                predictionEngine = container "Prediction Engine" "Runs ML/NLP models to generate trading signals. Owns Signal Cache." "Python" {
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
                portfolioManager = container "Risk & Portfolio Manager" "Validates signals, applies portfolio rules, manages exposure." "Nest.js" {
                    gRPC = component "Risk & Portfolio API" "Exposes risk/strategy config management gRPC API to API Gateway." "gRPC" "API"

                    riskRules = component "Risk Rules Engine" "Applies portfolio rules (max drawdown, stop-loss, diversification, trading enabled/disabled state)." "TypeScript"
                    strategyConfigManager = component "Strategy Config Manager" "Receives strategy updates and start/stop commands from API Gateway and manages rule sets." "TypeScript"
                    portfolioManager = component "Portfolio Manager" "Tracks positions, balances, allocations and risk exposure." "TypeScript"
                    repository = component "Repository" "Persists trades, fills and portfolio state into PostgreSQL." "TypeScript"

                    kafkaConsumer = component "Kafka Consumer" "Consumes trading.signals, trading.signals.portfolio, and execution updates (orders.placed/orders.fills) from Kafka." "TypeScript"
                    kafkaPublisher = component "Kafka Publisher" "Publishes trading.signals.portfolio, trades.approved/trades.rejected, and portfolio.updated events to Kafka." "TypeScript"

                    gRPC -> strategyConfigManager "Handles risk/strategy config updates via"
                    gRPC -> portfolioManager "Handles portfolio/trade requests via"
                    kafkaConsumer -> riskRules "Feeds trading.signals and trading.signals.portfolio into"
                    kafkaConsumer -> portfolioManager "Feeds orders.placed/orders.fills updates into"
                    strategyConfigManager -> riskRules "Provides rule updates to"
                    riskRules -> kafkaPublisher "Publishes portfolio-ordered signals and trade decisions to"
                    portfolioManager -> kafkaPublisher "Publishes instrument registration and portfolio update events to"
                    portfolioManager -> repository "Persists portfolio state and trades via"
                    riskRules -> repository "Logs risk decisions via"
                }

                postgres = container "Portfolio DB" "Stores portfolio, positions, users and trade history." "PostgreSQL" "Datastore"

            }

            group "Execution Engine Service" {
                executionEngine = container "Execution Engine" "Places and manages orders on exchanges." "Nest.js" {
                    gRPC = component "Trades API" "Exposes execution/order lifecycle gRPC API for internal consumers." "gRPC" "API"
                    gRPC_Client = component "gRPC Client" "Handles internal service-to-service communication." "gRPC"

                    core = component "Execution Core" "Main logic for order management and execution." "TypeScript"
                    tradeExecutor = component "Trade Executor" "Sends orders to exchanges via APIs, manages order lifecycle." "TypeScript"

                    kafkaPublisher = component "Kafka Publisher" "Publishes orders.placed and orders.fills execution updates to Kafka." "TypeScript"
                    kafkaConsumer = component "Kafka Consumer" "Consumes approved trades from Kafka." "TypeScript"

                    gRPC -> core "Handles trade requests via"
                    core -> tradeExecutor "Sends trade orders via"
                    tradeExecutor -> kafkaPublisher "Publishes orders.placed and orders.fills updates to"
                    kafkaConsumer -> tradeExecutor "Delivers approved trades to"
                    tradeExecutor -> gRPC_Client "Communicates with External API Facade over"
                }
            }

            group "API Gateway Service" {
                apiGateway = container "API Gateway" "Coordinates services, exposes API to dashboard." "Nest.js" {
                    REST = component "API" "Allows users to configure strategies and risk profiles. Fetches data from other services." "REST" "API"
                    gRPC_Client = component "gRPC Client" "Handles internal service-to-service communication." "gRPC"

                    core = component "Core Orchestration" "Coordinates between services, manages workflows." "TypeScript"

                    marketDataProxy = component "Market Data Proxy" "Forwards dashboard queries to Data Ingestion (Market Data API)." "TypeScript"
                    portfolioProxy = component "Portfolio Proxy" "Forwards dashboard portfolio/trade read queries to Risk & Portfolio Manager (source-of-truth Portfolio API)." "TypeScript"
                    signalProxy = component "Signal Proxy" "Forwards dashboard queries to Prediction Engine (Signal API)." "TypeScript"
                    riskProxy = component "Risk Proxy" "Forwards strategy/risk config updates to Risk & Portfolio Manager (Risk API)." "TypeScript"

                    REST -> core "Handles API requests via"
                    core -> marketDataProxy "Sends market data requests to"
                    core -> portfolioProxy "Sends portfolio/trade requests to"
                    core -> signalProxy "Sends signal requests to"
                    core -> riskProxy "Forwards strategy/risk config updates AND start/stop trading commands to"
                    marketDataProxy -> gRPC_Client "Communicates with Data Ingestion over gRPC"
                    portfolioProxy -> gRPC_Client "Communicates with Risk & Portfolio Manager over gRPC"
                    signalProxy -> gRPC_Client "Communicates with Prediction Engine over gRPC"
                    riskProxy -> gRPC_Client "Communicates with Risk & Portfolio Manager over gRPC"
                }
            }
            
            externalAPIFacade = container "External API Facade" "Handles external API integrations (e.g., Binance)." "Nest.js" {
                gRPC = component "External Facade API" "Exposes gRPC API for internal services to interact with external exchanges." "gRPC" "API"

                core = component "Facade Core" "Manages connections and interactions with external exchange APIs." "TypeScript"
                binanceClient = component "Binance Client" "Handles REST and WebSocket connections to Binance API." "TypeScript"
                kafkaPublisher = component "Kafka Publisher" "Publishes market data to Kafka." "TypeScript"

                core -> kafkaPublisher "Publishes raw data to"
                gRPC -> core "Handles external API requests via"
                core -> binanceClient "Sends requests to Binance via"
            }

            dashboard = container "Dashboard" "React" "User interface for monitoring and controlling the bot." "Single Page Application" {
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
            redis = container "Signal Cache" "Owned by Prediction Engine. Stores recent signals for fast access." "Redis" "Datastore"

            // Message bus
            messageBus = container "Message Bus" "Event-driven communication and streaming backbone." "Apache Kafka" "Queue"
            schemaRegistry = container "Schema Registry" "Kafka schema registry for event contracts and versioning." "Schema Registry" "Service"

            // ML training pipeline placeholder (out of scope for now)
            modelRegistry = container "Model Registry" "Stores versioned ML models for deployment." "Registry" "Service"
            trainingPipeline = container "Model Training Pipeline" "Offline training/evaluation pipeline (placeholder)." "Batch/ML" "Service"
        }

        // External systems
        group "External Systems" {
            binance = softwareSystem "Binance API" "External exchange providing market data and accepting trade orders." "External"
        }

        // Container-level relationships
        trader -> tradingBot.dashboard.router "Monitors portfolio and configures strategies"

        tradingBot.dashboard.apiClient -> tradingBot.apiGateway.REST "Sends API requests (UI)"
        tradingBot.apiGateway.gRPC_Client -> tradingBot.dataIngestion.gRPC "Requests market data and subscription updates (Market Data API)"
        tradingBot.apiGateway.gRPC_Client -> tradingBot.predictionEngine.gRPC "Requests current signals / triggers (Signal API)"
        tradingBot.apiGateway.gRPC_Client -> tradingBot.portfolioManager.gRPC "Requests portfolio/trade info (source-of-truth Portfolio API)"
        tradingBot.apiGateway.gRPC_Client -> tradingBot.portfolioManager.gRPC "Sends updated risk/strategy configuration and start/stop trading commands"
        
        tradingBot.dataIngestion.repository -> tradingBot.timescale "Writes historical market data to"

        tradingBot.externalAPIFacade.kafkaPublisher -> tradingBot.messageBus "Publishes market.raw.data to"
        tradingBot.featureEngineering.kafkaPublisher -> tradingBot.messageBus "Publishes features.indicators to"
        tradingBot.predictionEngine.kafkaPublisher -> tradingBot.messageBus "Publishes trading.signals to"
        tradingBot.portfolioManager.kafkaPublisher -> tradingBot.messageBus "Publishes instrument.registered to"
        tradingBot.portfolioManager.kafkaPublisher -> tradingBot.messageBus "Publishes trading.signals.portfolio to"
        tradingBot.portfolioManager.kafkaPublisher -> tradingBot.messageBus "Publishes trades.approved and trades.rejected to"
        tradingBot.portfolioManager.kafkaPublisher -> tradingBot.messageBus "Publishes portfolio.updated to"
        tradingBot.executionEngine.kafkaPublisher -> tradingBot.messageBus "Publishes orders.placed and orders.fills to"

        tradingBot.dataIngestion.kafkaConsumer -> tradingBot.messageBus "Consumes instrument.registered, market.raw.data, and features.indicators from"
        tradingBot.featureEngineering.kafkaConsumer -> tradingBot.messageBus "Consumes market.raw.data from"
        tradingBot.predictionEngine.kafkaConsumer -> tradingBot.messageBus "Consumes features.indicators from"
        tradingBot.portfolioManager.kafkaConsumer -> tradingBot.messageBus "Consumes trading.signals and trading.signals.portfolio from"
        tradingBot.portfolioManager.kafkaConsumer -> tradingBot.messageBus "Consumes orders.placed and orders.fills from"
        tradingBot.executionEngine.kafkaConsumer -> tradingBot.messageBus "Consumes trades.approved from"

        tradingBot.predictionEngine.signalCacheManager -> tradingBot.redis "Writes recent signals to"

        tradingBot.portfolioManager.repository -> tradingBot.postgres "Writes portfolio and trades to"

        tradingBot.executionEngine.gRPC_Client -> tradingBot.externalAPIFacade.gRPC "Places orders on"
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
            include tradingBot.portfolioManager.kafkaConsumer
            include tradingBot.portfolioManager.riskRules
            include tradingBot.portfolioManager.strategyConfigManager
            include tradingBot.portfolioManager.kafkaPublisher
            include tradingBot.portfolioManager.portfolioManager
            include tradingBot.portfolioManager.repository
            include tradingBot.postgres
            include tradingBot.messageBus
            autolayout lr
        }

        container tradingBot "Kafka-Containers" {
            include tradingBot.messageBus
            include tradingBot.schemaRegistry
            autolayout lr
        }

        component tradingBot.executionEngine "ExecutionEngine-Components" {
            include tradingBot.apiGateway.gRPC_Client
            include tradingBot.executionEngine.core
            include tradingBot.executionEngine.kafkaConsumer
            include tradingBot.executionEngine.kafkaPublisher
            include tradingBot.executionEngine.tradeExecutor
            include tradingBot.executionEngine.gRPC
            include tradingBot.executionEngine.gRPC_Client
            include tradingBot.messageBus
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
            include tradingBot.apiGateway.signalProxy
            include tradingBot.apiGateway.riskProxy
            include tradingBot.dataIngestion.gRPC
            include tradingBot.predictionEngine.gRPC
            include tradingBot.portfolioManager.gRPC
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
        }
    }

}
