# Deploy progress — purple.rpaul.net

Snapshot of where the AWS deploy stands. Original plan: `~/.claude/plans/i-ll-get-the-aws-zesty-kite.md`.

## Account / identifiers

- AWS account: `273048386910`
- IAM user in use: `arn:aws:iam::273048386910:user/richard` (AdministratorAccess via `admins` group)
- Domain: `purple.rpaul.net`
- Route 53 hosted zone (`rpaul.net`): `Z0911651H189TMYTW01I`
- Lambda region: **`ap-southeast-2`** (Sydney) — moved from Auckland; see "Region pivot" below.
- ACM region: `us-east-1` (CloudFront requirement)

## Resources created

| Resource | ID / ARN |
|---|---|
| ACM certificate (us-east-1) | `arn:aws:acm:us-east-1:273048386910:certificate/0eb4b07a-7cb2-4aed-b743-1a6b5c98de07` (status: ISSUED) |
| ACM DNS validation CNAME | `_a5e231926bc27ef28081a5ba8416b8e7.purple.rpaul.net` → `_7d9f2dd140a1f943eb9da52dc0eacbfb.jkddzztszm.acm-validations.aws.` (in Route 53) |
| IAM role | `arn:aws:iam::273048386910:role/purple-10m-lambda-role` (AWSLambdaBasicExecutionRole attached) |
| Lambda function | `arn:aws:lambda:ap-southeast-2:273048386910:function:purple-10m` (nodejs20.x, handler `handler.handler`, 256MB, 10s timeout) |
| Function URL | `https://yk7qsixmsl3u4atz53vm35yoyq0xopcn.lambda-url.ap-southeast-2.on.aws/` (auth NONE, BUFFERED) |
| Function URL resource policy | Statement `PublicInvoke` allowing `lambda:InvokeFunctionUrl` from `*` with `FunctionUrlAuthType=NONE` |

`aws lambda invoke` directly returns 200 with valid HTML — the function itself is healthy.

## Region pivot (Auckland → Sydney)

Initially deployed Lambda to `ap-southeast-6` (Auckland). Function URLs return:

```
AccessDeniedException: Unable to determine service/operation name to be authorized
```

Both `create-function-url-config` and `list-function-url-configs` fail this way despite full admin perms and no SCPs (account is not in an org). Conclusion: Lambda Function URLs aren't yet rolled out in `ap-southeast-6`. The function itself works in Auckland; only the URL feature is missing.

Pivoted to `ap-southeast-2` (Sydney). Auckland function was deleted. Negligible UX impact since CloudFront caches at the edge for 5 min.

## Current blocker

`curl https://yk7qsixmsl3u4atz53vm35yoyq0xopcn.lambda-url.ap-southeast-2.on.aws/` → `403 Forbidden` with `x-amzn-ErrorType: AccessDeniedException`, body `{"Message":"Forbidden. For troubleshooting Function URL authorization issues, see: https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html"}`.

State that should make it work but doesn't:
- `AuthType: NONE` confirmed via `aws lambda get-function-url-config`.
- Resource policy attached, condition matches: `lambda:FunctionUrlAuthType = NONE`, principal `*`, action `lambda:InvokeFunctionUrl`.
- No org SCPs (account is standalone).
- Removed and re-added the permission once already; same result.

Next things to try when resuming:
1. Wait longer (>5 min) and retry — IAM resource-policy propagation for Function URLs can be slow.
2. Delete and recreate the Function URL config itself (not just the permission).
3. Check for any account-level Lambda public-access block (newer feature).
4. As a fallback, swap the front-door to API Gateway HTTP API in `ap-southeast-2` — Lambda stays put, only the CloudFront origin changes.

## Remaining steps

5. **CloudFront distribution** — origin: Function URL host (strip `https://` and trailing `/`); origin protocol `https-only`; viewer `redirect-to-https`; methods `GET,HEAD`; cache policy `Managed-CachingOptimized`; aliases `[purple.rpaul.net]`; viewer cert `arn:aws:acm:us-east-1:273048386910:certificate/0eb4b07a-7cb2-4aed-b743-1a6b5c98de07` (SNI, TLSv1.2_2021); compression on. Capture distribution `Id` + `DomainName`.
6. **Route 53 alias** — A-alias on `purple.rpaul.net` → CloudFront `DomainName`, alias hosted-zone `Z2FDTNDATAQYW2` (well-known CloudFront zone), `EvaluateTargetHealth=false`. Hosted zone is `Z0911651H189TMYTW01I`.
7. **Verify** — `curl -sS https://purple.rpaul.net | head -c 200` returns `<!DOCTYPE html>` containing `Purple 10M Fixtures`; second request shows `x-cache: Hit from cloudfront`; CloudWatch log group `/aws/lambda/purple-10m` exists in `ap-southeast-2` with at least one stream.

## Cost expectation

Effectively $0/month at ~50 invocations/month. Lambda + CloudFront always-free tiers cover everything; Route 53 alias queries to AWS targets are free; ACM cert is free; existing `rpaul.net` hosted zone fee ($0.50/mo) is unchanged.

## Cleanup commands (reverse order, if needed)

```sh
aws route53 change-resource-record-sets --hosted-zone-id Z0911651H189TMYTW01I --change-batch '{"Changes":[{"Action":"DELETE",...}]}'
aws cloudfront update-distribution --id <ID> ... --distribution-config '{...Enabled:false...}' && aws cloudfront delete-distribution --id <ID> --if-match <ETag>
aws lambda delete-function-url-config --region ap-southeast-2 --function-name purple-10m
aws lambda delete-function --region ap-southeast-2 --function-name purple-10m
aws iam detach-role-policy --role-name purple-10m-lambda-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name purple-10m-lambda-role
aws acm delete-certificate --region us-east-1 --certificate-arn arn:aws:acm:us-east-1:273048386910:certificate/0eb4b07a-7cb2-4aed-b743-1a6b5c98de07
# Also delete the ACM validation CNAME from Route 53.
```
