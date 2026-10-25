-- REVIEWED, UNAPPLIED. Dry-run by default via scripts/label-reviewed-email-log.ts.
-- Targets the hardcoded 37 reviewed EmailLog ids. Not a createdAt date range.
-- Apply only with: npx tsx scripts/label-reviewed-email-log.ts --apply
-- Preserves all rows. Does not DELETE. Does not INSERT. Does not send or enqueue mail.

UPDATE "EmailLog"
SET outcome = 'acceptance_unknown'
WHERE id IN (
  'cmvlkjpcx06a6l707lvs7skvu',
  'cmvlkq53w06agl707zus6qstv',
  'cmvll2vqy06aml7073hzay637',
  'cmvll9g0j06b0l707s5jkcglx',
  'cmvlny0gs0017ie07a7j1sgj8',
  'cmvlo5558001jie07jyh6xc9h',
  'cmvloapro001zie078thi7nbf',
  'cmvloh8uq0029ie07q9gwdtny',
  'cmvlonkzh002jie072p0nx9ip',
  'cmvm6cb1f06e7l808rf53lqqb',
  'cmvm7et4406egl808m86tzav7',
  'cmvm7y1hq0005lh08cgkydj0t',
  'cmvm84rhq000rlh08eejo12eg',
  'cmvm8b1tm05tclh08c9vxnkkj',
  'cmvm8hclm05tilh08zm1ea9k9',
  'cmvm8npna05u0lh08r9as49v6',
  'cmvm97dr70009l508nk6xb9hs',
  'cmvm9k4wz000fl508xy4xbgc9',
  'cmvm9qi93000pl508z75qq4ou',
  'cmvm9x3sx001bl508prhntfcg',
  'cmvmc2df3001bjp07wm4ws1gd',
  'cmvmc3egz001jjp07z7gwk4bi',
  'cmvmclh8b002gjp071lj7gr1k',
  'cmvmg62i1000bjs076j5sifai',
  'cmvmg7ljt000rjs07lh8if0u8',
  'cmvmg8z3x000xjs07yppnbgqo',
  'cmvmgaa2m0013js07imjbqy3z',
  'cmvmgd7xc0019js071no4gazc',
  'cmvmlcqjw0077l807k87sdwpb',
  'cmvmlduzj007rl807rbc7hip0',
  'cmvmleigx0085l807y477tmfr',
  'cmvmlficr008ll807audfovfy',
  'cmvmlgv8u008vl807iqodokpg',
  'cmvmlj5ml0099l807q0k5nwlc',
  'cmvmxup0v004fi107pgyjxa7i',
  'cmvmxvnao004oi107uteqtlnf',
  'cmvmxvt3f004ri107bnpxbj1j'
);
