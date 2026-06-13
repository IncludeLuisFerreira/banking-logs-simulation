# Makefile - Simulação Bancária Node.js
# ============================================================
# Automação de tarefas comuns do projeto.
# Uso: make <comando>
# ============================================================

# Variáveis
APP_DIR := app
NODE := node
NPM := npm
DOCKER_COMPOSE := docker-compose

# Cores para saída no terminal
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: help install start test stress clean lint docker-up docker-down fmt

# ============================================================
# Comandos Principais
# ============================================================

## help        : Mostra esta mensagem de ajuda
help:
	@echo "$(GREEN)Simulação Bancária Node.js - Comandos disponíveis:$(NC)"
	@echo ""
	@grep -E '^## .+:' $(MAKEFILE_LIST) | sed 's/## /  make /' | column -t -s ':'
	@echo ""

## install     : Instala todas as dependências do projeto
install:
	@echo "$(YELLOW)→ Instalando dependências...$(NC)"
	cd $(APP_DIR) && $(NPM) install
	@echo "$(GREEN)✓ Dependências instaladas com sucesso!$(NC)"

## start       : Inicia a simulação bancária
start:
	@echo "$(GREEN)→ Iniciando simulação bancária...$(NC)"
	cd $(APP_DIR) && $(NPM) start

## test        : Executa a suite de testes com cobertura
test:
	@echo "$(YELLOW)→ Executando testes...$(NC)"
	cd $(APP_DIR) && $(NPM) test
	@echo "$(GREEN)✓ Testes finalizados!$(NC)"

## stress      : Executa o teste de estresse (10.000 contas / 50.000 transações)
stress:
	@echo "$(YELLOW)→ Iniciando teste de estresse...$(NC)"
	cd $(APP_DIR) && NUM_CONTAS=10000 NUM_TRANSACOES=50000 $(NODE) app.js
	@echo "$(GREEN)✓ Teste de estresse concluído!$(NC)"

## lint        : Verifica a qualidade do código (placeholder para ESLint)
lint:
	@echo "$(YELLOW)→ Verificando código...$(NC)"
	@echo "$(RED)! ESLint não configurado. Adicione com: npm install --save-dev eslint$(NC)"
	@echo "$(YELLOW)  Dica: npx eslint $(APP_DIR)/src$(NC)"

## fmt         : Formata o código (placeholder para Prettier)
fmt:
	@echo "$(YELLOW)→ Formatando código...$(NC)"
	@echo "$(RED)! Prettier não configurado. Adicione com: npm install --save-dev prettier$(NC)"
	@echo "$(YELLOW)  Dica: npx prettier --write $(APP_DIR)/src$(NC)"

# ============================================================
# Docker / Observabilidade
# ============================================================

## docker-up   : Sobe toda a stack de observabilidade (Docker Compose)
docker-up:
	@echo "$(GREEN)→ Subindo stack de observabilidade...$(NC)"
	$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)✓ Stack no ar!$(NC)"
	@echo "  - Aplicação:  http://localhost:3000"
	@echo "  - Grafana:    http://localhost:3001"
	@echo "  - Prometheus: http://localhost:9090"

## docker-down : Derruba toda a stack de observabilidade
docker-down:
	@echo "$(RED)→ Derrubando stack de observabilidade...$(NC)"
	$(DOCKER_COMPOSE) down -v
	@echo "$(GREEN)✓ Stack removida!$(NC)"

## docker-logs : Mostra logs dos containers em tempo real
docker-logs:
	$(DOCKER_COMPOSE) logs -f

# ============================================================
# Limpeza
# ============================================================

## clean       : Remove relatórios, node_modules e arquivos temporários
clean:
	@echo "$(RED)→ Limpando arquivos temporários...$(NC)"
	rm -f $(APP_DIR)/relatorio.txt
	rm -rf $(APP_DIR)/node_modules
	rm -f $(APP_DIR)/package-lock.json
	@echo "$(GREEN)✓ Limpo! Rode 'make install' para reinstalar.$(NC)"

## clean-reports: Remove apenas os relatórios gerados
clean-reports:
	@echo "$(RED)→ Removendo relatórios...$(NC)"
	rm -f $(APP_DIR)/relatorio.txt
	@echo "$(GREEN)✓ Relatórios removidos!$(NC)"