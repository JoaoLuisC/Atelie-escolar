-- Troca de e-mail pela aba "Minha conta" (handlers/teacher/account.js).
--
-- `profiles.email` é o espelho de `auth.users.email`, mas só era preenchido na
-- CRIAÇÃO da conta (handle_new_user). Quando o e-mail muda no Supabase Auth —
-- a troca só vale depois do clique no link de confirmação, fora do nosso
-- código —, o perfil ficava com o endereço antigo: o painel mostrava o e-mail
-- errado e as buscas por e-mail (pedidos, papel) deixavam de achar a conta.
--
-- Este trigger copia o e-mail novo para o perfil no momento em que o Auth o
-- grava. SECURITY DEFINER pelo mesmo motivo do handle_new_user: roda dentro da
-- transação do Auth, e o guard de `profiles` (profiles_guard_privileged_cols)
-- só deixa o dono da função mexer na coluna `email`.

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles
       set email = new.email,
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_profile_email() from public;
revoke execute on function public.sync_profile_email() from anon;
revoke execute on function public.sync_profile_email() from authenticated;

do $$
begin
  drop trigger if exists on_auth_user_email_changed on auth.users;
  create trigger on_auth_user_email_changed
    after update of email on auth.users
    for each row execute function public.sync_profile_email();
exception when insufficient_privilege then
  raise notice 'Sem privilégio para criar trigger em auth.users; crie manualmente on_auth_user_email_changed.';
end;
$$;
