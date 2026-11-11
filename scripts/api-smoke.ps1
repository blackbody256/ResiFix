$ErrorActionPreference = 'Stop'

$BaseUrl = if ($env:RESIFIX_API_URL) { $env:RESIFIX_API_URL.TrimEnd('/') } else { 'http://localhost:3000/api' }
$OtpCode = if ($env:RESIFIX_OTP_CODE) { $env:RESIFIX_OTP_CODE } else { '123456' }

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Token,
    [object]$Body
  )

  $headers = @{}
  if ($Token) {
    $headers.Authorization = "Bearer $Token"
  }

  $params = @{
    Uri = "$BaseUrl$Path"
    Method = $Method
    Headers = $headers
    UseBasicParsing = $true
  }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = $Body | ConvertTo-Json -Depth 10 -Compress
  }

  try {
    $response = Invoke-WebRequest @params
    $content = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }
    return [pscustomobject]@{
      Status = [int]$response.StatusCode
      Body = $content
    }
  } catch {
    $response = $_.Exception.Response
    if (-not $response) {
      throw
    }
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $raw = $reader.ReadToEnd()
    $reader.Dispose()
    $content = if ($raw) { $raw | ConvertFrom-Json } else { $null }
    return [pscustomobject]@{
      Status = [int]$response.StatusCode
      Body = $content
    }
  }
}

function Assert-Status {
  param(
    [Parameter(Mandatory = $true)]$Response,
    [Parameter(Mandatory = $true)][int]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if ($Response.Status -ne $Expected) {
    $body = if ($Response.Body) { $Response.Body | ConvertTo-Json -Depth 10 -Compress } else { '<empty>' }
    throw "$Label failed: expected HTTP $Expected, got $($Response.Status): $body"
  }
  Write-Host "[PASS] $Label (HTTP $Expected)" -ForegroundColor Green
}

function Login {
  param([Parameter(Mandatory = $true)][string]$Phone)
  Assert-Status (Invoke-Api -Method POST -Path '/auth/request-otp' -Body @{ phone = $Phone }) 200 "Request OTP for $Phone"
  $verified = Invoke-Api -Method POST -Path '/auth/verify-otp' -Body @{ phone = $Phone; code = $OtpCode }
  Assert-Status $verified 200 "Verify OTP for $Phone"
  return $verified.Body
}

function Get-FirstFaultItem {
  param([Parameter(Mandatory = $true)]$Categories)
  foreach ($category in $Categories.categories) {
    foreach ($item in $category.items) {
      if ($item.name -eq 'Leaking tap') {
        return $item
      }
    }
  }
  foreach ($category in $Categories.categories) {
    if ($category.items.Count -gt 0) {
      return $category.items[0]
    }
  }
  throw 'No active fault item was returned'
}

Write-Host "Testing $BaseUrl" -ForegroundColor Cyan

$health = Invoke-Api -Method GET -Path '/health'
Assert-Status $health 200 'Health check'

$unauthorized = Invoke-Api -Method GET -Path '/properties/facilities'
Assert-Status $unauthorized 401 'Unauthenticated request is rejected'

$admin = Login '+256700000002'
$aisha = Login '+256700000010'
$brian = Login '+256700000011'

Assert-Status (Invoke-Api -Method GET -Path '/auth/me' -Token $aisha.token) 200 'Resident auth/me'
$mine = Invoke-Api -Method GET -Path '/properties/mine' -Token $aisha.token
Assert-Status $mine 200 'Resident property scope'

$categories = Invoke-Api -Method GET -Path '/reporting/fault-categories' -Token $aisha.token
Assert-Status $categories 200 'Fault catalogue'
$faultItem = Get-FirstFaultItem $categories.Body

$residentFacilityAttempt = Invoke-Api -Method POST -Path '/properties/facilities' -Token $aisha.token -Body @{
  name = "Resident Must Not Create $(Get-Date -Format 'yyyyMMddHHmmss')"
}
Assert-Status $residentFacilityAttempt 403 'Resident cannot create facilities'

$facilityName = "API Smoke Facility $(Get-Date -Format 'yyyyMMddHHmmss')"
$createdFacility = Invoke-Api -Method POST -Path '/properties/facilities' -Token $admin.token -Body @{
  name = $facilityName
  location = 'Ground-floor laundry room'
}
Assert-Status $createdFacility 201 'Admin creates facility'
$facilityId = $createdFacility.Body.facility.id

$updatedFacility = Invoke-Api -Method PATCH -Path "/properties/facilities/$facilityId" -Token $admin.token -Body @{
  location = 'Ground-floor laundry room near reception'
}
Assert-Status $updatedFacility 200 'Admin updates facility'

$facilities = Invoke-Api -Method GET -Path '/properties/facilities' -Token $aisha.token
Assert-Status $facilities 200 'Resident lists facilities'
if (-not ($facilities.Body.facilities | Where-Object { $_.id -eq $facilityId })) {
  throw 'Created facility was not returned in the scoped facility list'
}
Write-Host '[PASS] Facility is visible within the resident property only' -ForegroundColor Green

$badAvailability = Invoke-Api -Method PUT -Path '/reporting/availability' -Token $aisha.token -Body @{
  windows = @(
    @{ weekday = 'MON'; startMinute = 540; endMinute = 660 },
    @{ weekday = 'MON'; startMinute = 600; endMinute = 720 }
  )
}
Assert-Status $badAvailability 400 'Overlapping availability is rejected'

$availability = Invoke-Api -Method PUT -Path '/reporting/availability' -Token $aisha.token -Body @{
  windows = @(
    @{ weekday = 'MON'; startMinute = 540; endMinute = 600 },
    @{ weekday = 'SUN'; startMinute = 1430; endMinute = 1440 }
  )
}
Assert-Status $availability 200 'Availability replacement'
if ($availability.Body.windows.Count -ne 2) {
  throw 'Availability replacement did not persist exactly two windows'
}
Write-Host '[PASS] Availability accepts Sunday and endMinute 1440' -ForegroundColor Green

$readAvailability = Invoke-Api -Method GET -Path '/reporting/availability' -Token $aisha.token
Assert-Status $readAvailability 200 'Read own availability'
if (-not ($readAvailability.Body.windows | Where-Object { $_.weekday -eq 'SUN' -and $_.endMinute -eq 1440 })) {
  throw 'Sunday 1440 availability window was not returned'
}
Write-Host '[PASS] Availability persisted and can be read back' -ForegroundColor Green

$roomId = $mine.Body.property.blocks[0].rooms[0].id
$roomAvailability = Invoke-Api -Method GET -Path '/reporting/availability?userId=does-not-belong-to-resident' -Token $aisha.token
Assert-Status $roomAvailability 404 'Resident cannot read another resident availability'

$canonical = Invoke-Api -Method POST -Path '/reporting/tickets' -Token $aisha.token -Body @{
  facilityId = $facilityId
  faultItemId = $faultItem.id
  description = 'API smoke test: shared laundry tap is leaking'
}
Assert-Status $canonical 201 'Resident reports facility fault'
$canonicalId = $canonical.Body.ticket.id
if ($canonical.Body.ticket.roomId) {
  throw 'Facility ticket unexpectedly has roomId'
}
if ($canonical.Body.ticket.facilityId -ne $facilityId) {
  throw 'Facility ticket has the wrong facilityId'
}
Write-Host '[PASS] Facility ticket has facilityId and no roomId' -ForegroundColor Green

$candidatePath = "/reporting/duplicate-candidates?faultItemId=$([uri]::EscapeDataString($faultItem.id))&facilityId=$([uri]::EscapeDataString($facilityId))"
$candidates = Invoke-Api -Method GET -Path $candidatePath -Token $brian.token
Assert-Status $candidates 200 'Duplicate candidate lookup'
$candidate = $candidates.Body.candidates | Where-Object { $_.id -eq $canonicalId } | Select-Object -First 1
if (-not $candidate) {
  throw 'The canonical facility ticket was not returned as a duplicate candidate'
}
if ($candidate.PSObject.Properties.Name -contains 'reporter' -or
    $candidate.PSObject.Properties.Name -contains 'description' -or
    $candidate.PSObject.Properties.Name -contains 'photos') {
  throw 'Duplicate candidate response leaked private report fields'
}
Write-Host '[PASS] Candidate is physical-target scoped and privacy-safe' -ForegroundColor Green

$follow = Invoke-Api -Method POST -Path "/reporting/tickets/$canonicalId/follow" -Token $brian.token
Assert-Status $follow 201 'Resident follows canonical ticket'
$followerId = $follow.Body.ticket.id
if ($follow.Body.duplicateLink.canonicalId -ne $canonicalId) {
  throw 'DuplicateLink points to the wrong canonical ticket'
}
Write-Host "[PASS] Follow created follower ticket $followerId" -ForegroundColor Green

$repeatFollow = Invoke-Api -Method POST -Path "/reporting/tickets/$canonicalId/follow" -Token $brian.token
Assert-Status $repeatFollow 201 'Repeated follow is idempotent'
if ($repeatFollow.Body.ticket.id -ne $followerId) {
  throw 'Repeated follow created a second follower ticket'
}
Write-Host '[PASS] Repeated follow returned the existing follower' -ForegroundColor Green

$deactivated = Invoke-Api -Method PATCH -Path "/properties/facilities/$facilityId" -Token $admin.token -Body @{
  isActive = $false
}
Assert-Status $deactivated 200 'Admin deactivates facility'

$inactiveTicket = Invoke-Api -Method POST -Path '/reporting/tickets' -Token $aisha.token -Body @{
  facilityId = $facilityId
  faultItemId = $faultItem.id
  description = 'This must be rejected because the facility is inactive'
}
Assert-Status $inactiveTicket 404 'Inactive facility cannot receive new tickets'

Write-Host ''
Write-Host 'API smoke test completed successfully.' -ForegroundColor Cyan
