import { EDITION } from "@/domain/edition";
import { MemberCard, Teach } from "./pixel";

/** O ícone do público da festa: o quadro, para professoras e professores; o crachá, para servidoras e servidores. */
export const PersonIcon = EDITION.askTeacher ? Teach : MemberCard;
