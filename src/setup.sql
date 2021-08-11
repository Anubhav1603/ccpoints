create extension pgcrypto;
alter database fwapoints set timezone to 'UTC';

create table users (
    userid serial primary key,
    name text unique not null,
    email text unique not null,
    password text null,
    perms jsonb not null default '[]'::jsonb,
        /* valid perms: (also update in user.ejs and do_user.js)
            * all: implicit all permissions
            * login
                log in
                view private notes
                force reload
            * record
                record sync
                add sanctions/rewards (transactions)
                edit clan zerowin and redzone
                edit existing transactions
                delete transactions
            * manage
                add/remove/edit users and their permissions
                view audit log
            * update
                update system
        */
    apikey text unique null
);
insert into users (name, email, password, perms) values
    ('root', 'root', crypt('root', gen_salt('bf')), '["all"]'::jsonb);
insert into users (name, email, apikey) values
    ('(sanctions sheet)', '_sanctions', '91c4fc99-132b-439b-8467-36e59c23b548'),
    ('(rewards sheet)', '_rewards', 'de235ce2-c14c-4637-b242-d8522e90366b');

create table clans (
    clantag text primary key,
    clanname text not null,
    active boolean not null default false,
    lastchecked timestamp with time zone null,
    logprivate boolean not null default false,
    warid int null,
    special jsonb not null default '[]'::jsonb,
        /* valid special:
            redzone = points pinned to -50
            zerowin = points pinned to -100
        */
    points int not null default 0
        -- only a memoization, completely dependent data
);
create index on clans (active, clanname);
create index on clans (active, lastchecked);

create table faillog (
    failid serial primary key,
    userid int not null references users,
    ts timestamp with time zone not null default current_timestamp,
    action text not null,
    postdata jsonb null
);
create index on faillog (ts);

create table auditlog (
    userid int not null references users,
    clantag text null references clans,
    ts timestamp with time zone not null default current_timestamp,
    action text not null,
        /* valid actions and cdata:
            * login: {to: url, email}
            * edit: {from: special, to: special}
            * reload: {active: int, all: int}
            * edituser: {userid, from: perms, to: perms}
            * register: {userid, name, email, perms, apikey}
            * profile: {from, to, passwordChanged}
            * transaction: {transid, from, to, newPoints}
            * deltransaction: {transid, from, newPoints}
            * record: {transid, to, newPoints}
            * sync: {count}
        */
    cdata jsonb null
);
create index on auditlog(clantag, ts);
create index on auditlog(userid, ts);
create index on auditlog(ts);

create table wars (
    warid serial primary key,
    ts timestamp with time zone not null, -- endTime
    clanatag text not null,
    clanbtag text not null, -- nb: no foreign key! may not exist!
    recordeda boolean not null default false,
    recordedb boolean not null default false,
    data jsonb not null
        /* data has:
            a: [data]
            b: [data]
            result: 1 for a win, -1 for b win, 0 for draw
            teamSize
            [data] can be either:
            {tag, clanLevel, badgeUrlLarge, pct, name, stars, attacks, expEarned, active}
            or
            {tag, clanLevel, badgeUrlLarge, pct, name, stars}
            if both sides are seen, we'll have larger one for both, otherwise, smaller for one
            active is always either true or not present, and means whether the clan was active at the time
        */
);
create unique index on wars(clanatag, clanbtag, ts);
create index on wars(clanbtag, ts);
alter table clans add constraint clans_warid_fkey foreign key (warid) references wars(warid);

create table transactions (
    transid serial primary key,
    clantag text not null references clans,
    ts timestamp with time zone not null default current_timestamp,
        -- always timestamp of action, not timestamp of war
    warid int null references wars,
    pubnote text null,
    privnote text null,
    points int not null,
    reason text null,
        /* reason has import or sync or zerowin or redzone
            if added for that reason automatically
            then they can be removed automatically easily */
    deleted boolean default false
);
create index on transactions (clantag, ts, transid);
create index on transactions (deleted, clantag, ts, transid);
