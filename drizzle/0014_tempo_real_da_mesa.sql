-- Mesa dos kits em tempo real: cada entrada registrada (ou estornada) e cada kit
-- entregue (ou estornado) avisa quem está escutando o canal "desk_queue".
-- O aviso só sai quando a transação confirma (regra do NOTIFY no PostgreSQL).
CREATE OR REPLACE FUNCTION "festa_desk_notify"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'check_in' THEN
    PERFORM pg_notify('desk_queue', json_build_object('t', 'entry', 'p', NEW.person_id)::text);
  ELSE
    PERFORM pg_notify('desk_queue', json_build_object('t', 'kit', 'p', NEW.beneficiary_person_id)::text);
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "check_in_desk_notify" ON "check_in";--> statement-breakpoint
CREATE TRIGGER "check_in_desk_notify" AFTER INSERT OR UPDATE ON "check_in" FOR EACH ROW EXECUTE FUNCTION "festa_desk_notify"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "kit_delivery_desk_notify" ON "kit_delivery";--> statement-breakpoint
CREATE TRIGGER "kit_delivery_desk_notify" AFTER INSERT OR UPDATE ON "kit_delivery" FOR EACH ROW EXECUTE FUNCTION "festa_desk_notify"();
