-- ═══════════════════════════════════════════════════════════════
-- Migration 005: ERP Tables (Financeiro, Conciliação Bancária)
-- ═══════════════════════════════════════════════════════════════

-- ─── Categorias Financeiras ──────────────────────────────────
CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('receita', 'despesa', 'ambos')),
    color VARCHAR(7) DEFAULT '#708090',
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categorias_tenant ON categorias(tenant_id);
CREATE INDEX idx_categorias_type ON categorias(tenant_id, type);
CREATE INDEX idx_categorias_parent ON categorias(parent_id) WHERE parent_id IS NOT NULL;

CREATE TRIGGER trg_categorias_updated
    BEFORE UPDATE ON categorias
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Contas Bancárias ────────────────────────────────────────
CREATE TABLE contas_bancarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255),
    bank_code VARCHAR(10),
    agency VARCHAR(20),
    account_number VARCHAR(30),
    account_type VARCHAR(20) DEFAULT 'corrente'
        CHECK (account_type IN ('corrente', 'poupanca', 'investimento', 'caixa')),
    initial_balance DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(7) DEFAULT '#4A6FA5',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contas_bancarias_tenant ON contas_bancarias(tenant_id);

CREATE TRIGGER trg_contas_bancarias_updated
    BEFORE UPDATE ON contas_bancarias
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Contas a Pagar ──────────────────────────────────────────
CREATE TABLE contas_pagar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    conta_bancaria_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
    description VARCHAR(500) NOT NULL,
    supplier VARCHAR(255),
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    amount_paid DECIMAL(15,2) DEFAULT 0 CHECK (amount_paid >= 0),
    discount DECIMAL(15,2) DEFAULT 0 CHECK (discount >= 0),
    interest DECIMAL(15,2) DEFAULT 0 CHECK (interest >= 0),
    due_date DATE NOT NULL,
    payment_date DATE,
    competence_date DATE,
    status VARCHAR(20) DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado', 'parcial')),
    recurrence VARCHAR(20) DEFAULT 'unica'
        CHECK (recurrence IN ('unica', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual')),
    recurrence_end_date DATE,
    parent_id UUID REFERENCES contas_pagar(id),
    installment_number INT,
    total_installments INT,
    document_number VARCHAR(100),
    barcode VARCHAR(100),
    pix_key VARCHAR(255),
    notes TEXT,
    attachments JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cp_tenant_status ON contas_pagar(tenant_id, status);
CREATE INDEX idx_cp_due_date ON contas_pagar(tenant_id, due_date);
CREATE INDEX idx_cp_supplier ON contas_pagar(tenant_id, supplier);
CREATE INDEX idx_cp_categoria ON contas_pagar(categoria_id);
CREATE INDEX idx_cp_vencidas ON contas_pagar(tenant_id, due_date)
    WHERE status = 'pendente';

CREATE TRIGGER trg_cp_updated
    BEFORE UPDATE ON contas_pagar
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- Auto-mark overdue bills
CREATE OR REPLACE FUNCTION fn_check_overdue_contas_pagar()
RETURNS void AS $$
BEGIN
    UPDATE contas_pagar
    SET status = 'vencido', updated_at = NOW()
    WHERE status = 'pendente'
      AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- ─── Contas a Receber ────────────────────────────────────────
CREATE TABLE contas_receber (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    conta_bancaria_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    description VARCHAR(500) NOT NULL,
    client_name VARCHAR(255),
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    amount_received DECIMAL(15,2) DEFAULT 0 CHECK (amount_received >= 0),
    discount DECIMAL(15,2) DEFAULT 0 CHECK (discount >= 0),
    interest DECIMAL(15,2) DEFAULT 0 CHECK (interest >= 0),
    due_date DATE NOT NULL,
    receipt_date DATE,
    competence_date DATE,
    status VARCHAR(20) DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'recebido', 'vencido', 'cancelado', 'parcial')),
    recurrence VARCHAR(20) DEFAULT 'unica'
        CHECK (recurrence IN ('unica', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual')),
    recurrence_end_date DATE,
    parent_id UUID REFERENCES contas_receber(id),
    installment_number INT,
    total_installments INT,
    invoice_number VARCHAR(100),
    nf_number VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cr_tenant_status ON contas_receber(tenant_id, status);
CREATE INDEX idx_cr_due_date ON contas_receber(tenant_id, due_date);
CREATE INDEX idx_cr_client ON contas_receber(tenant_id, client_name);
CREATE INDEX idx_cr_lead ON contas_receber(lead_id) WHERE lead_id IS NOT NULL;

CREATE TRIGGER trg_cr_updated
    BEFORE UPDATE ON contas_receber
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Transações (Movimentações Efetivas) ─────────────────────
CREATE TABLE transacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conta_bancaria_id UUID NOT NULL REFERENCES contas_bancarias(id),
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    conta_pagar_id UUID REFERENCES contas_pagar(id) ON DELETE SET NULL,
    conta_receber_id UUID REFERENCES contas_receber(id) ON DELETE SET NULL,
    transfer_to_account_id UUID REFERENCES contas_bancarias(id),
    type VARCHAR(15) NOT NULL CHECK (type IN ('entrada', 'saida', 'transferencia')),
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    balance_after DECIMAL(15,2),
    description VARCHAR(500) NOT NULL,
    transaction_date DATE NOT NULL,
    competence_date DATE,
    reference_number VARCHAR(100),
    is_conciliated BOOLEAN DEFAULT false,
    conciliated_at TIMESTAMPTZ,
    conciliated_by UUID REFERENCES users(id),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tx_conta ON transacoes(conta_bancaria_id, transaction_date DESC);
CREATE INDEX idx_tx_conciliacao ON transacoes(conta_bancaria_id, is_conciliated)
    WHERE is_conciliated = false;
CREATE INDEX idx_tx_tenant_date ON transacoes(tenant_id, transaction_date DESC);
CREATE INDEX idx_tx_categoria ON transacoes(categoria_id);
CREATE INDEX idx_tx_cp ON transacoes(conta_pagar_id) WHERE conta_pagar_id IS NOT NULL;
CREATE INDEX idx_tx_cr ON transacoes(conta_receber_id) WHERE conta_receber_id IS NOT NULL;

-- ─── Trigger: Atualizar saldo da conta após transação ────────
CREATE OR REPLACE FUNCTION fn_update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_new_balance DECIMAL(15,2);
BEGIN
    -- Lock the account row to prevent concurrent balance corruption
    PERFORM 1 FROM contas_bancarias WHERE id = NEW.conta_bancaria_id FOR UPDATE;

    IF NEW.type = 'entrada' THEN
        UPDATE contas_bancarias
        SET current_balance = current_balance + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.conta_bancaria_id
        RETURNING current_balance INTO v_new_balance;

    ELSIF NEW.type = 'saida' THEN
        UPDATE contas_bancarias
        SET current_balance = current_balance - NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.conta_bancaria_id
        RETURNING current_balance INTO v_new_balance;

    ELSIF NEW.type = 'transferencia' THEN
        -- Debit source account
        UPDATE contas_bancarias
        SET current_balance = current_balance - NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.conta_bancaria_id
        RETURNING current_balance INTO v_new_balance;

        -- Credit destination account
        IF NEW.transfer_to_account_id IS NOT NULL THEN
            UPDATE contas_bancarias
            SET current_balance = current_balance + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.transfer_to_account_id;
        END IF;
    END IF;

    NEW.balance_after := v_new_balance;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_balance
    BEFORE INSERT ON transacoes
    FOR EACH ROW EXECUTE FUNCTION fn_update_account_balance();

-- ─── Função de Conciliação Bancária (ACID) ───────────────────
CREATE OR REPLACE FUNCTION fn_conciliar_saldo(
    p_conta_id UUID,
    p_mes INT,
    p_ano INT
) RETURNS TABLE(
    saldo_inicial DECIMAL,
    total_entradas DECIMAL,
    total_saidas DECIMAL,
    total_transferencias DECIMAL,
    saldo_calculado DECIMAL,
    saldo_atual DECIMAL,
    diferenca DECIMAL,
    conciliado BOOLEAN,
    total_transacoes BIGINT,
    transacoes_nao_conciliadas BIGINT
) AS $$
DECLARE
    v_inicio DATE;
    v_fim DATE;
BEGIN
    v_inicio := make_date(p_ano, p_mes, 1);
    v_fim := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    RETURN QUERY
    WITH saldo_anterior AS (
        SELECT COALESCE(
            (SELECT t.balance_after
             FROM transacoes t
             WHERE t.conta_bancaria_id = p_conta_id
               AND t.transaction_date < v_inicio
             ORDER BY t.transaction_date DESC, t.created_at DESC
             LIMIT 1),
            (SELECT cb.initial_balance
             FROM contas_bancarias cb
             WHERE cb.id = p_conta_id)
        ) AS valor
    ),
    movimentos AS (
        SELECT
            COALESCE(SUM(CASE WHEN t.type = 'entrada' THEN t.amount ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN t.type = 'saida' THEN t.amount ELSE 0 END), 0) AS saidas,
            COALESCE(SUM(CASE WHEN t.type = 'transferencia' THEN t.amount ELSE 0 END), 0) AS transferencias,
            COUNT(*) AS total_tx,
            COUNT(*) FILTER (WHERE NOT t.is_conciliated) AS nao_conciliadas
        FROM transacoes t
        WHERE t.conta_bancaria_id = p_conta_id
          AND t.transaction_date BETWEEN v_inicio AND v_fim
    )
    SELECT
        sa.valor AS saldo_inicial,
        m.entradas AS total_entradas,
        m.saidas AS total_saidas,
        m.transferencias AS total_transferencias,
        (sa.valor + m.entradas - m.saidas - m.transferencias) AS saldo_calculado,
        cb.current_balance AS saldo_atual,
        (cb.current_balance - (sa.valor + m.entradas - m.saidas - m.transferencias)) AS diferenca,
        (cb.current_balance = (sa.valor + m.entradas - m.saidas - m.transferencias)) AS conciliado,
        m.total_tx AS total_transacoes,
        m.nao_conciliadas AS transacoes_nao_conciliadas
    FROM saldo_anterior sa
    CROSS JOIN movimentos m
    CROSS JOIN contas_bancarias cb
    WHERE cb.id = p_conta_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── View: Resumo financeiro mensal por tenant ───────────────
CREATE OR REPLACE VIEW vw_resumo_financeiro AS
SELECT
    t.tenant_id,
    DATE_TRUNC('month', t.transaction_date)::DATE AS mes,
    SUM(CASE WHEN t.type = 'entrada' THEN t.amount ELSE 0 END) AS receitas,
    SUM(CASE WHEN t.type = 'saida' THEN t.amount ELSE 0 END) AS despesas,
    SUM(CASE WHEN t.type = 'entrada' THEN t.amount ELSE 0 END) -
    SUM(CASE WHEN t.type = 'saida' THEN t.amount ELSE 0 END) AS lucro_liquido,
    COUNT(*) AS total_transacoes
FROM transacoes t
GROUP BY t.tenant_id, DATE_TRUNC('month', t.transaction_date);
