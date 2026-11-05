# System Architecture Requirements: E-Commerce Web Application

## 1. System Overview
The system provides high-availability online shopping services for web and mobile clients.

## 2. Mandatory Architectural Components
1. **Client Tier**: Web browsers and mobile clients accessing the application.
2. **API Gateway / Server**: An application server cluster terminating all incoming traffic and orchestrating business logic.
3. **Caching Layer**: A distributed **Redis In-Memory Cache** must be deployed between the Server and Database to reduce read load on the database.
4. **Primary Database**: A relational database (**PostgreSQL Primary**) for transactional order and inventory data.
5. **Replica Database**: An asynchronous **Read Replica Database** to support read-heavy analytics and reporting queries.

## 3. Communication & Security Requirements
1. Client-to-Server communication must enforce secure **HTTPS/TLS 1.3**; plaintext HTTP is strictly prohibited.
2. The Server queries the Redis Cache before querying the Primary Database.
3. All database interactions from the Server must utilize parameterized SQL queries over encrypted connections.
4. Direct client access to the database or cache is prohibited; all traffic must pass through the Server tier.

## 4. Non-Functional & Reliability Constraints
1. **High Availability**: No Single Point of Failure (SPOF) permitted in data persistence.
2. **Data Consistency**: Orders must write directly to the Primary Database.

