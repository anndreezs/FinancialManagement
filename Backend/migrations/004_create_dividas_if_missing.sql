CREATE TABLE IF NOT EXISTS dividas (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(10,2) NOT NULL CHECK (valor > 0),
  data_vencimento DATE NOT NULL,
  status ENUM('pendente','paga','atrasada') NOT NULL DEFAULT 'pendente',
  categoria_id INT NOT NULL,
  tipo_divida ENUM('fixa','parcelada') NOT NULL,
  parcela_total INT DEFAULT NULL,
  parcela_atual INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_dividas_categoria (categoria_id),
  KEY ix_dividas_vencimento_status (data_vencimento, status),
  CONSTRAINT fk_dividas_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;