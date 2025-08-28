from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, date, timedelta
import bcrypt
import jwt
import json
import io
import csv
from collections import defaultdict
import calendar

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()
JWT_SECRET = "expense-tracker-secret-key-2024"
JWT_ALGORITHM = "HS256"

# Predefined expense categories with icons
PREDEFINED_CATEGORIES = {
    "Food & Dining": "🍽️",
    "Transportation": "🚗",
    "Bills & Utilities": "💡",
    "Shopping": "🛍️",
    "Healthcare": "🏥",
    "Entertainment": "🎬",
    "Travel": "✈️",
    "Education": "📚",
    "Insurance": "🛡️",
    "Other": "📦"
}

# Models
class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class User(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    created_at: datetime

class ExpenseCreate(BaseModel):
    title: str
    amount: float
    category: str
    type: str = "expense"
    description: Optional[str] = None
    date: Optional[str] = None

class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None

class Expense(BaseModel):
    id: str
    user_id: str
    title: str
    amount: float
    category: str
    type: str = "expense"
    description: Optional[str] = None
    date: str
    created_at: datetime

class CustomCategory(BaseModel):
    id: str
    user_id: str
    name: str
    icon: str = "📦"
    goal: Optional[float] = None
    created_at: datetime

class CategoryCreate(BaseModel):
    name: str
    icon: Optional[str] = "📦"
    goal: Optional[float] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    goal: Optional[float] = None

class Budget(BaseModel):
    id: str
    user_id: str
    category: str
    limit_amount: float
    period: str  # "monthly", "weekly"
    start_date: str
    end_date: str
    current_spent: float = 0.0
    is_active: bool = True
    created_at: datetime

class BudgetCreate(BaseModel):
    category: str
    limit_amount: float
    period: str = "monthly"

class BudgetUpdate(BaseModel):
    limit_amount: Optional[float] = None
    is_active: Optional[bool] = None

class BudgetAlert(BaseModel):
    id: str
    user_id: str
    budget_id: str
    message: str
    alert_type: str  # "warning", "exceeded"
    percentage: float
    created_at: datetime
    is_read: bool = False

# Auth Helper Functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.utcnow().timestamp() + 86400  # 24 hours
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Helper Functions
def get_date_range(period: str, custom_start: str = None, custom_end: str = None):
    """Get start and end dates for different periods"""
    today = date.today()
    
    if period == "today":
        return str(today), str(today)
    elif period == "week":
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        return str(start), str(end)
    elif period == "month":
        start = today.replace(day=1)
        next_month = today.replace(day=28) + timedelta(days=4)
        end = next_month - timedelta(days=next_month.day)
        return str(start), str(end)
    elif period == "year":
        start = today.replace(month=1, day=1)
        end = today.replace(month=12, day=31)
        return str(start), str(end)
    elif period == "custom" and custom_start and custom_end:
        return custom_start, custom_end
    else:
        # Default to current month
        start = today.replace(day=1)
        next_month = today.replace(day=28) + timedelta(days=4)
        end = next_month - timedelta(days=next_month.day)
        return str(start), str(end)

async def check_budget_alerts(user_id: str):
    """Check for budget alerts and create notifications"""
    budgets = await db.budgets.find({"user_id": user_id, "is_active": True}).to_list(100)
    
    for budget in budgets:
        # Calculate current spending for this budget period
        expenses = await db.expenses.find({
            "user_id": user_id,
            "category": budget["category"],
            "type": "expense",
            "date": {"$gte": budget["start_date"], "$lte": budget["end_date"]}
        }).to_list(1000)
        
        current_spent = sum(expense["amount"] for expense in expenses)
        percentage = (current_spent / budget["limit_amount"]) * 100 if budget["limit_amount"] > 0 else 0
        
        # Update budget with current spending
        await db.budgets.update_one(
            {"id": budget["id"]},
            {"$set": {"current_spent": current_spent}}
        )
        
        # Check for alerts
        alert_created = False
        if percentage >= 100 and not await db.budget_alerts.find_one({
            "budget_id": budget["id"], 
            "alert_type": "exceeded",
            "created_at": {"$gte": datetime.utcnow() - timedelta(days=1)}
        }):
            # Budget exceeded
            alert = BudgetAlert(
                id=str(uuid.uuid4()),
                user_id=user_id,
                budget_id=budget["id"],
                message=f"Budget exceeded for {budget['category']}! Spent ${current_spent:.2f} of ${budget['limit_amount']:.2f}",
                alert_type="exceeded",
                percentage=percentage,
                created_at=datetime.utcnow()
            )
            await db.budget_alerts.insert_one(alert.dict())
            alert_created = True
            
        elif percentage >= 80 and not alert_created and not await db.budget_alerts.find_one({
            "budget_id": budget["id"], 
            "alert_type": "warning",
            "created_at": {"$gte": datetime.utcnow() - timedelta(days=1)}
        }):
            # Budget warning (80% threshold)
            alert = BudgetAlert(
                id=str(uuid.uuid4()),
                user_id=user_id,
                budget_id=budget["id"],
                message=f"Budget warning for {budget['category']}! {percentage:.1f}% spent (${current_spent:.2f} of ${budget['limit_amount']:.2f})",
                alert_type="warning",
                percentage=percentage,
                created_at=datetime.utcnow()
            )
            await db.budget_alerts.insert_one(alert.dict())

# # Auth Routes
# @api_router.post("/auth/register")
# async def register(user_data: UserCreate):
#     existing_user = await db.users.find_one({"username": user_data.username})
#     if existing_user:
#         raise HTTPException(status_code=400, detail="Username already exists")
    
#     hashed_password = hash_password(user_data.password)
#     user = User(
#         id=str(uuid.uuid4()),
#         username=user_data.username, 
#         email=user_data.email,
#         created_at=datetime.utcnow()
#     )
#     user_dict = user.dict()
#     user_dict["password"] = hashed_password
    
#     await db.users.insert_one(user_dict)
#     token = create_jwt_token(user.id)
    
#     return {
#         "message": "User created successfully",
#         "token": token,
#         "user": {
#             "id": user.id,
#             "username": user.username,
#             "email": user.email
#         }
#     }
@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    logger.info(f"Register request: {user_data.username}")
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        logger.warning("Username already exists")
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_password = hash_password(user_data.password)
    logger.info("Password hashed successfully")

    user = User(
        id=str(uuid.uuid4()),
        username=user_data.username, 
        email=user_data.email,
        created_at=datetime.utcnow()
    )
    user_dict = user.dict()
    user_dict["password"] = hashed_password
    
    result = await db.users.insert_one(user_dict)
    logger.info(f"User inserted with _id: {result.inserted_id}")

    token = create_jwt_token(user.id)
    return {"message": "User created successfully", "token": token, "user": user_dict}


@api_router.post("/auth/login")
async def login(login_data: UserLogin):
    user = await db.users.find_one({"username": login_data.username})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(login_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user["id"])
    
    return {
        "message": "Login successful",
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user.get("email")
        }
    }

# Categories Routes
@api_router.get("/categories")
async def get_categories(current_user: User = Depends(get_current_user)):
    custom_categories = await db.custom_categories.find({"user_id": current_user.id}).to_list(100)
    
    predefined_list = [{"name": name, "icon": icon, "is_custom": False} 
                      for name, icon in PREDEFINED_CATEGORIES.items()]
    
    custom_list = [{"name": cat["name"], "icon": cat.get("icon", "📦"), 
                   "goal": cat.get("goal"), "is_custom": True, "id": cat["id"]} 
                  for cat in custom_categories]
    
    all_categories = predefined_list + custom_list
    
    return {
        "predefined": predefined_list,
        "custom": custom_list,
        "all": all_categories
    }

@api_router.post("/categories")
async def create_category(category_data: CategoryCreate, current_user: User = Depends(get_current_user)):
    existing = await db.custom_categories.find_one({
        "user_id": current_user.id,
        "name": category_data.name
    })
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    if category_data.name in PREDEFINED_CATEGORIES:
        raise HTTPException(status_code=400, detail="Category already exists in predefined list")
    
    category = CustomCategory(
        id=str(uuid.uuid4()),
        user_id=current_user.id, 
        name=category_data.name,
        icon=category_data.icon or "📦",
        goal=category_data.goal,
        created_at=datetime.utcnow()
    )
    await db.custom_categories.insert_one(category.dict())
    
    return {"message": "Category created successfully", "category": category}

@api_router.put("/categories/{category_id}")
async def update_category(
    category_id: str,
    category_data: CategoryUpdate,
    current_user: User = Depends(get_current_user)
):
    existing_category = await db.custom_categories.find_one({
        "id": category_id, 
        "user_id": current_user.id
    })
    if not existing_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = {k: v for k, v in category_data.dict().items() if v is not None}
    if update_data:
        await db.custom_categories.update_one(
            {"id": category_id, "user_id": current_user.id},
            {"$set": update_data}
        )
    
    return {"message": "Category updated successfully"}

# Budget Routes
@api_router.get("/budgets")
async def get_budgets(current_user: User = Depends(get_current_user)):
    budgets = await db.budgets.find({"user_id": current_user.id}).to_list(100)
    
    # Update current spending for each budget
    for budget in budgets:
        await check_budget_alerts(current_user.id)
    
    # Fetch updated budgets
    updated_budgets = await db.budgets.find({"user_id": current_user.id}).to_list(100)
    return [Budget(**budget) for budget in updated_budgets]

@api_router.post("/budgets")
async def create_budget(budget_data: BudgetCreate, current_user: User = Depends(get_current_user)):
    # Check if budget already exists for this category and period
    today = date.today()
    
    if budget_data.period == "monthly":
        start_date = today.replace(day=1)
        next_month = today.replace(day=28) + timedelta(days=4)
        end_date = next_month - timedelta(days=next_month.day)
    else:  # weekly
        start_date = today - timedelta(days=today.weekday())
        end_date = start_date + timedelta(days=6)
    
    existing_budget = await db.budgets.find_one({
        "user_id": current_user.id,
        "category": budget_data.category,
        "period": budget_data.period,
        "is_active": True
    })
    
    if existing_budget:
        raise HTTPException(status_code=400, detail="Active budget already exists for this category and period")
    
    budget = Budget(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        category=budget_data.category,
        limit_amount=budget_data.limit_amount,
        period=budget_data.period,
        start_date=str(start_date),
        end_date=str(end_date),
        created_at=datetime.utcnow()
    )
    
    await db.budgets.insert_one(budget.dict())
    return {"message": "Budget created successfully", "budget": budget}

@api_router.put("/budgets/{budget_id}")
async def update_budget(
    budget_id: str,
    budget_data: BudgetUpdate,
    current_user: User = Depends(get_current_user)
):
    existing_budget = await db.budgets.find_one({
        "id": budget_id, 
        "user_id": current_user.id
    })
    if not existing_budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    update_data = {k: v for k, v in budget_data.dict().items() if v is not None}
    if update_data:
        await db.budgets.update_one(
            {"id": budget_id, "user_id": current_user.id},
            {"$set": update_data}
        )
    
    return {"message": "Budget updated successfully"}

@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, current_user: User = Depends(get_current_user)):
    result = await db.budgets.delete_one({"id": budget_id, "user_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    return {"message": "Budget deleted successfully"}

@api_router.get("/budgets/alerts")
async def get_budget_alerts(current_user: User = Depends(get_current_user)):
    await check_budget_alerts(current_user.id)
    alerts = await db.budget_alerts.find({"user_id": current_user.id}).sort("created_at", -1).to_list(50)
    return [BudgetAlert(**alert) for alert in alerts]

@api_router.put("/budgets/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, current_user: User = Depends(get_current_user)):
    result = await db.budget_alerts.update_one(
        {"id": alert_id, "user_id": current_user.id},
        {"$set": {"is_read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    return {"message": "Alert marked as read"}

# Expense Routes
@api_router.post("/expenses")
async def create_expense(expense_data: ExpenseCreate, current_user: User = Depends(get_current_user)):
    expense = Expense(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=expense_data.title,
        amount=expense_data.amount,
        category=expense_data.category,
        type=expense_data.type,
        description=expense_data.description,
        date=expense_data.date or str(date.today()),
        created_at=datetime.utcnow()
    )
    
    await db.expenses.insert_one(expense.dict())
    
    # Check for budget alerts after adding expense
    if expense_data.type == "expense":
        await check_budget_alerts(current_user.id)
    
    return {"message": "Expense created successfully", "expense": expense}

@api_router.get("/expenses")
async def get_expenses(
    category: Optional[str] = None,
    type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    filter_query = {"user_id": current_user.id}
    
    if category:
        filter_query["category"] = category
    if type:
        filter_query["type"] = type
    if start_date:
        filter_query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in filter_query:
            filter_query["date"]["$lte"] = end_date
        else:
            filter_query["date"] = {"$lte": end_date}
    
    expenses = await db.expenses.find(filter_query).sort("date", -1).to_list(1000)
    return [Expense(**expense) for expense in expenses]

@api_router.put("/expenses/{expense_id}")
async def update_expense(
    expense_id: str,
    expense_data: ExpenseUpdate,
    current_user: User = Depends(get_current_user)
):
    existing_expense = await db.expenses.find_one({"id": expense_id, "user_id": current_user.id})
    if not existing_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    update_data = {k: v for k, v in expense_data.dict().items() if v is not None}
    if update_data:
        await db.expenses.update_one(
            {"id": expense_id, "user_id": current_user.id},
            {"$set": update_data}
        )
        
        # Check budget alerts after update
        await check_budget_alerts(current_user.id)
    
    return {"message": "Expense updated successfully"}

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, current_user: User = Depends(get_current_user)):
    result = await db.expenses.delete_one({"id": expense_id, "user_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted successfully"}

# Analytics Routes
@api_router.get("/analytics/summary")
async def get_summary(
    period: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Get date range
    if period != "custom":
        start_date, end_date = get_date_range(period)
    
    date_filter = {"user_id": current_user.id}
    if start_date and end_date:
        date_filter["date"] = {"$gte": start_date, "$lte": end_date}
    
    all_transactions = await db.expenses.find(date_filter).to_list(1000)
    
    total_expenses = sum(t["amount"] for t in all_transactions if t["type"] == "expense")
    total_income = sum(t["amount"] for t in all_transactions if t["type"] == "income")
    balance = total_income - total_expenses
    
    # Category breakdown for expenses
    category_totals = {}
    for transaction in all_transactions:
        if transaction["type"] == "expense":
            category = transaction["category"]
            category_totals[category] = category_totals.get(category, 0) + transaction["amount"]
    
    return {
        "total_expenses": total_expenses,
        "total_income": total_income,
        "balance": balance,
        "category_breakdown": category_totals,
        "transaction_count": len(all_transactions),
        "period": period,
        "start_date": start_date,
        "end_date": end_date
    }

@api_router.get("/analytics/charts")
async def get_chart_data(
    period: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Get date range
    if period != "custom":
        start_date, end_date = get_date_range(period)
    
    date_filter = {"user_id": current_user.id}
    if start_date and end_date:
        date_filter["date"] = {"$gte": start_date, "$lte": end_date}
    
    all_transactions = await db.expenses.find(date_filter).to_list(1000)
    
    # Pie chart data - expenses by category
    expense_categories = {}
    income_categories = {}
    
    for transaction in all_transactions:
        category = transaction["category"]
        amount = transaction["amount"]
        
        if transaction["type"] == "expense":
            expense_categories[category] = expense_categories.get(category, 0) + amount
        else:
            income_categories[category] = income_categories.get(category, 0) + amount
    
    # Bar chart data - daily/monthly spending
    daily_spending = defaultdict(float)
    daily_income = defaultdict(float)
    
    for transaction in all_transactions:
        transaction_date = transaction["date"]
        amount = transaction["amount"]
        
        if transaction["type"] == "expense":
            daily_spending[transaction_date] += amount
        else:
            daily_income[transaction_date] += amount
    
    # Sort by date
    sorted_dates = sorted(set(list(daily_spending.keys()) + list(daily_income.keys())))
    
    return {
        "pie_chart": {
            "expenses": {
                "labels": list(expense_categories.keys()),
                "data": list(expense_categories.values())
            },
            "income": {
                "labels": list(income_categories.keys()),
                "data": list(income_categories.values())
            }
        },
        "bar_chart": {
            "labels": sorted_dates,
            "expenses": [daily_spending.get(date, 0) for date in sorted_dates],
            "income": [daily_income.get(date, 0) for date in sorted_dates]
        },
        "period": period,
        "start_date": start_date,
        "end_date": end_date
    }

# Reports Routes
@api_router.get("/reports/summary")
async def generate_report(
    period: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Get date range
    if period != "custom":
        start_date, end_date = get_date_range(period)
    
    date_filter = {"user_id": current_user.id}
    if start_date and end_date:
        date_filter["date"] = {"$gte": start_date, "$lte": end_date}
    
    all_transactions = await db.expenses.find(date_filter).sort("date", -1).to_list(1000)
    
    # Calculate summary statistics
    total_expenses = sum(t["amount"] for t in all_transactions if t["type"] == "expense")
    total_income = sum(t["amount"] for t in all_transactions if t["type"] == "income")
    balance = total_income - total_expenses
    
    # Category breakdown
    category_stats = {}
    for transaction in all_transactions:
        category = transaction["category"]
        transaction_type = transaction["type"]
        amount = transaction["amount"]
        
        if category not in category_stats:
            category_stats[category] = {"expenses": 0, "income": 0, "transactions": 0}
        
        category_stats[category][transaction_type] += amount
        category_stats[category]["transactions"] += 1
    
    # Top categories by spending
    top_expense_categories = sorted(
        [(cat, data["expenses"]) for cat, data in category_stats.items() if data["expenses"] > 0],
        key=lambda x: x[1], reverse=True
    )[:5]
    
    return {
        "report_period": f"{start_date} to {end_date}",
        "summary": {
            "total_income": total_income,
            "total_expenses": total_expenses,
            "net_balance": balance,
            "total_transactions": len(all_transactions)
        },
        "category_breakdown": category_stats,
        "top_expense_categories": top_expense_categories,
        "transactions": [Expense(**t) for t in all_transactions],
        "generated_at": datetime.utcnow().isoformat()
    }

@api_router.get("/reports/export")
async def export_transactions(
    format: str = "csv",
    period: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Get date range
    if period != "custom":
        start_date, end_date = get_date_range(period)
    
    date_filter = {"user_id": current_user.id}
    if start_date and end_date:
        date_filter["date"] = {"$gte": start_date, "$lte": end_date}
    
    transactions = await db.expenses.find(date_filter).sort("date", -1).to_list(1000)
    
    if format.lower() == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(["Date", "Title", "Category", "Type", "Amount", "Description"])
        
        # Write transactions
        for transaction in transactions:
            writer.writerow([
                transaction["date"],
                transaction["title"],
                transaction["category"],
                transaction["type"],
                transaction["amount"],
                transaction.get("description", "")
            ])
        
        output.seek(0)
        content = output.getvalue()
        output.close()
        
        filename = f"expense_report_{start_date}_to_{end_date}.csv"
        
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    elif format.lower() == "json":
        report_data = {
            "report_period": f"{start_date} to {end_date}",
            "exported_at": datetime.utcnow().isoformat(),
            "transactions": transactions
        }
        
        filename = f"expense_report_{start_date}_to_{end_date}.json"
        content = json.dumps(report_data, indent=2, default=str)
        
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'csv' or 'json'")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()